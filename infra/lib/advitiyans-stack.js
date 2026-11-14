"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvitiyansStack = void 0;
const cdk = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const rds = require("aws-cdk-lib/aws-rds");
const secretsmanager = require("aws-cdk-lib/aws-secretsmanager");
const cognito = require("aws-cdk-lib/aws-cognito");
const lambda = require("aws-cdk-lib/aws-lambda");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const s3 = require("aws-cdk-lib/aws-s3");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const origins = require("aws-cdk-lib/aws-cloudfront-origins");
const iam = require("aws-cdk-lib/aws-iam");
const events = require("aws-cdk-lib/aws-events");
const targets = require("aws-cdk-lib/aws-events-targets");
const s3n = require("aws-cdk-lib/aws-s3-notifications");
const path = require("path");
class AdvitiyansStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // ========================================================================
        // 1. VPC
        // ========================================================================
        const vpc = new ec2.Vpc(this, 'AdvitiyansVpc', {
            maxAzs: 2,
            natGateways: 0, // Cost optimized: avoid NatGateway hourly cost
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'Public',
                    subnetType: ec2.SubnetType.PUBLIC,
                },
                {
                    cidrMask: 24,
                    name: 'Isolated',
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                },
            ],
        });
        // Gateway Endpoints for S3 (free, no NAT needed)
        vpc.addGatewayEndpoint('S3Endpoint', {
            service: ec2.GatewayVpcEndpointAwsService.S3,
        });
        // ========================================================================
        // 2. Security Groups
        // ========================================================================
        // Lambda Security Group
        const lambdaSg = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
            vpc,
            description: 'Security group for Lambda functions',
            allowAllOutbound: false,
        });
        // RDS Instance Security Group
        const dbSg = new ec2.SecurityGroup(this, 'RdsSecurityGroup', {
            vpc,
            description: 'Security group for RDS PostgreSQL instance',
            allowAllOutbound: false,
        });
        // VPC Endpoint Security Group
        const vpceSecurityGroup = new ec2.SecurityGroup(this, 'VpceSecurityGroup', {
            vpc,
            description: 'Security group for VPC Interface Endpoints',
            allowAllOutbound: false,
        });
        // --- Security Group Rules ---
        // Lambda → RDS directly (port 5432) — no proxy
        lambdaSg.addEgressRule(dbSg, ec2.Port.tcp(5432), 'Lambda direct to RDS');
        dbSg.addIngressRule(lambdaSg, ec2.Port.tcp(5432), 'Allow Lambda direct to RDS');
        // Lambda → VPC Endpoints (port 443 for Secrets Manager)
        lambdaSg.addEgressRule(vpceSecurityGroup, ec2.Port.tcp(443), 'Lambda to VPC Endpoints');
        vpceSecurityGroup.addIngressRule(lambdaSg, ec2.Port.tcp(443), 'Allow Lambda to VPC Endpoints');
        // ========================================================================
        // 3. VPC Interface Endpoints
        // ========================================================================
        // Secrets Manager endpoint — needed by Lambda to fetch DB credentials
        vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
            subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
            securityGroups: [vpceSecurityGroup],
            privateDnsEnabled: true,
        });
        // NOTE: STS endpoint removed — was only needed for RDS Proxy IAM auth (proxy removed).
        // ========================================================================
        // 4. Database Secrets Manager
        // ========================================================================
        const dbSecret = new secretsmanager.Secret(this, 'AdvitiyansDbSecret', {
            secretName: 'advitiyans-db-credentials',
            generateSecretString: {
                secretStringTemplate: JSON.stringify({ username: 'postgres' }),
                generateStringKey: 'password',
                excludePunctuation: true,
            },
        });
        // ========================================================================
        // 5. RDS PostgreSQL Instance (db.t3.large, Single-AZ)
        //    Upgraded from t4g.micro: 1 GB RAM / 87 connections → 8 GB RAM / 855 connections
        //    Supports 10,000 students without connection exhaustion.
        // ========================================================================
        const dbInstance = new rds.DatabaseInstance(this, 'AdvitiyansRDS', {
            engine: rds.DatabaseInstanceEngine.postgres({
                version: rds.PostgresEngineVersion.VER_15,
            }),
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.LARGE),
            vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
            securityGroups: [dbSg],
            allocatedStorage: 30,
            maxAllocatedStorage: 100,
            credentials: rds.Credentials.fromSecret(dbSecret),
            databaseName: 'advitiyans',
            removalPolicy: cdk.RemovalPolicy.RETAIN, // Protect data from accidental cdk destroy
            autoMinorVersionUpgrade: true,
            publiclyAccessible: false,
            backupRetention: cdk.Duration.days(7), // Daily automated snapshots (free)
            deletionProtection: true, // Prevent accidental delete via console
            enablePerformanceInsights: true, // FREE on t3.large — 7-day query analysis
            monitoringInterval: cdk.Duration.seconds(60), // Enhanced Monitoring — OS-level metrics every 60s (~$0.50/mo)
            // NOTE: storageEncrypted cannot be enabled on an existing unencrypted instance.
            // It requires a replace (snapshot + restore). Skipping to avoid data loss risk.
        });
        // ========================================================================
        // 6. RDS Proxy — REMOVED (saves $22/month)
        //    With db.t3.large (855 max connections) and Lambda pool max=1 per
        //    instance, reserved concurrency 200 → max 200 DB connections total.
        //    200 << 855, so the proxy is redundant and costs money for nothing.
        //    Lambda now connects directly to the RDS instance endpoint.
        // ========================================================================
        // ========================================================================
        // 7. Pre Sign-Up Lambda Trigger
        // ========================================================================
        const preSignUpLambda = new lambda.Function(this, 'CognitoPreSignUpTrigger', {
            runtime: lambda.Runtime.NODEJS_22_X,
            handler: 'handlers/cognito-pre-signup.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
            vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
            securityGroups: [lambdaSg],
            environment: {
                DB_HOST: dbInstance.dbInstanceEndpointAddress, // Direct RDS — proxy removed
                DB_PORT: '5432',
                DB_NAME: 'advitiyans',
                DB_USER: 'postgres',
                DB_SECRET_ARN: dbSecret.secretArn,
                DB_SSL: 'true',
            },
        });
        dbSecret.grantRead(preSignUpLambda);
        // ========================================================================
        // 8. Cognito User Pool
        // ========================================================================
        const userPool = new cognito.UserPool(this, 'AdvitiyansUserPool', {
            userPoolName: 'advitiyans-user-pool',
            selfSignUpEnabled: true,
            signInAliases: { email: true },
            autoVerify: { email: true },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: false,
                requireDigits: true,
                requireSymbols: false,
            },
            customAttributes: {
                role: new cognito.StringAttribute({ mutable: true }),
                reg_no: new cognito.StringAttribute({ mutable: true }),
                year: new cognito.StringAttribute({ mutable: true }),
            },
            // ── Password Reset OTP Email Template ──
            userVerification: {
                emailSubject: 'OTP for RGM ManageBAC – Your One-Time Password',
                emailBody: 'Dear Faculty,\n\n' +
                    'You requested a password reset for your RGM ManageBAC account ({username}).\n\n' +
                    'Your One-Time Password (OTP) is:\n\n' +
                    '{####}\n\n' +
                    'This OTP is valid for 1 hour. Do not share it with anyone.\n\n' +
                    'If you did not request this, please ignore this email.\n\n' +
                    'Regards,\nRGM ManageBAC System\nRGM College of Engineering & Technology',
                emailStyle: cognito.VerificationEmailStyle.CODE,
            },
            lambdaTriggers: {
                preSignUp: preSignUpLambda,
            },
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        const userPoolClient = new cognito.UserPoolClient(this, 'AdvitiyansUserPoolClient', {
            userPool,
            userPoolClientName: 'advitiyans-web-client',
            generateSecret: false,
            authFlows: {
                userSrp: true,
                custom: true,
                adminUserPassword: true,
            },
        });
        // ========================================================================
        // 9. S3 Uploads Bucket (created before Lambda so env var can reference it)
        // ========================================================================
        const uploadsBucket = new s3.Bucket(this, 'AdvitiyansUploadsBucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            cors: [
                {
                    allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
                    allowedOrigins: ['*'],
                    allowedHeaders: ['*'],
                },
            ],
        });
        // ========================================================================
        // 10. Backend API Lambda Function (in VPC, connects via RDS Proxy)
        // ========================================================================
        // HMAC key for server-signed session tokens (admin/HOD/oversight/parent/DB-password logins).
        // Generated once by Secrets Manager; never stored in the repo or in GitHub Secrets.
        const sessionSigningSecret = new secretsmanager.Secret(this, 'AdvitiyansSessionSigningSecret', {
            description: 'HMAC key for Advitiyans server-signed session tokens',
            generateSecretString: { passwordLength: 64, excludePunctuation: true },
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        const apiLambda = new lambda.Function(this, 'AdvitiyansApiHandler', {
            runtime: lambda.Runtime.NODEJS_22_X,
            handler: 'handlers/api.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
            timeout: cdk.Duration.seconds(900), // Max 15 mins for EventBridge Cron. API Gateway will still drop at 29s.
            memorySize: 512, // 2× CPU speed vs 256 MB; runs ~35% faster
            // Account limit is now 1,000 concurrent executions. Cap the API at 300 copies so the
            // database (t3.large, ~855 connections) can never run out: 300 × pool max 2 = 600.
            // Leaves 700 for the notifier and other functions (AWS needs at least 100 unreserved).
            reservedConcurrentExecutions: 300,
            vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
            securityGroups: [lambdaSg],
            environment: {
                DB_HOST: dbInstance.dbInstanceEndpointAddress, // Direct RDS — proxy removed
                DB_PORT: '5432',
                DB_NAME: 'advitiyans',
                DB_USER: 'postgres',
                DB_SECRET_ARN: dbSecret.secretArn,
                DB_SSL: 'true',
                COGNITO_USER_POOL_ID: userPool.userPoolId,
                COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
                UPLOADS_BUCKET_NAME: uploadsBucket.bucketName,
                USE_MOCK: 'false',
                // Admin/HOD credentials — sourced from GitHub Secrets, never hardcoded in frontend
                ADMIN_MASTER_EMAIL: process.env.ADMIN_MASTER_EMAIL || 'admin@rgmcet.edu.in',
                ADMIN_MASTER_PASS: process.env.ADMIN_MASTER_PASS || '',
                HOD_MASTER_EMAIL: process.env.HOD_MASTER_EMAIL || 'hodcseds@rgmcet.edu.in',
                HOD_MASTER_PASS: process.env.HOD_MASTER_PASS || '',
                // Secret for protecting /db-init and /db-migrate endpoints
                ADMIN_SECRET: process.env.ADMIN_SECRET || '',
                // Faculty registration security key — required for faculty/HOD self-registration
                FACULTY_SECRET_KEY: process.env.FACULTY_SECRET_KEY || '',
                GITHUB_PAT: process.env.GITHUB_PAT || '',
                // Resolved by CloudFormation at deploy time (dynamic reference) — value never appears in the template
                SESSION_SIGNING_SECRET: sessionSigningSecret.secretValue.unsafeUnwrap(),
                // Notifications: public halves only — the notifier Lambda holds the private keys / bot token
                VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || '',
                TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME || '',
                BUILD_TIMESTAMP: new Date().toISOString(),
            },
        });
        dbSecret.grantRead(apiLambda);
        uploadsBucket.grantReadWrite(apiLambda);
        // NOTE: rdsProxy.grantConnect removed — proxy deleted. Lambda uses password auth via Secrets Manager.
        // Grant Lambda permission to delete and manage users in Cognito User Pool
        apiLambda.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'cognito-idp:AdminDeleteUser',
                'cognito-idp:AdminGetUser',
                'cognito-idp:AdminDisableUser',
                'cognito-idp:ListUsers',
                // Required for server-side sign-in (POST /auth/cognito-signin)
                'cognito-idp:AdminInitiateAuth',
                // Required for password sync and account healing
                'cognito-idp:AdminSetUserPassword',
                // Required for creating Cognito accounts for DB-only students
                'cognito-idp:AdminCreateUser',
            ],
            resources: [userPool.userPoolArn],
        }));
        // Nightly Cron Job (12:00 AM IST = 18:30 UTC) for Auto-Sync
        const nightlySyncRule = new events.Rule(this, 'NightlyCodingProfileSync', {
            schedule: events.Schedule.cron({ minute: '30', hour: '18', month: '*', weekDay: '*', year: '*' }),
            description: 'Triggers the API Lambda every night at 12 AM IST to batch sync stale LeetCode and GitHub coding profiles.',
        });
        nightlySyncRule.addTarget(new targets.LambdaFunction(apiLambda));
        // Keep-warm: ping the API Lambda every 5 minutes so the first login after a quiet spell
        // doesn't pay the cold-start cost (bundle load + Secrets Manager + DB TLS handshake).
        const keepWarmRule = new events.Rule(this, 'ApiKeepWarm', {
            schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
            description: 'Keeps one API Lambda instance and its DB connection warm.',
        });
        keepWarmRule.addTarget(new targets.LambdaFunction(apiLambda, {
            event: events.RuleTargetInput.fromObject({ warmup: true }),
        }));
        // ========================================================================
        // 11. API Gateway REST API
        // ========================================================================
        const api = new apigateway.RestApi(this, 'AdvitiyansRestApi', {
            restApiName: 'Advitiyans Placement Readiness API',
            description: 'API for Advitiyans Student 360 platform (direct RDS connection)',
            deployOptions: {
                throttlingBurstLimit: 2000, // Absorbs a burst of ~2000 requests (a whole batch logging in together)
                throttlingRateLimit: 1000, // Sustained 1000 requests/second (load test: 300/s cap threw 429s at 500/s)
                metricsEnabled: true, // Enables free CloudWatch metrics dashboard
            },
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: apigateway.Cors.DEFAULT_HEADERS.concat(['x-admin-secret', 'caller_email', 'x-caller-email', 'X-Requested-With']),
            },
        });
        api.addGatewayResponse('Default4XX', {
            type: apigateway.ResponseType.DEFAULT_4XX,
            responseHeaders: {
                'Access-Control-Allow-Origin': "'*'",
                'Access-Control-Allow-Headers': "'*'",
                'Access-Control-Allow-Methods': "'*'",
            },
        });
        api.addGatewayResponse('Default5XX', {
            type: apigateway.ResponseType.DEFAULT_5XX,
            responseHeaders: {
                'Access-Control-Allow-Origin': "'*'",
                'Access-Control-Allow-Headers': "'*'",
                'Access-Control-Allow-Methods': "'*'",
            },
        });
        const lambdaIntegration = new apigateway.LambdaIntegration(apiLambda);
        // Root GET / method — serves the frontend index.html over HTTPS
        api.root.addMethod('GET', lambdaIntegration, {
            authorizationType: apigateway.AuthorizationType.NONE,
        });
        const proxyResource = api.root.addProxy({
            defaultIntegration: lambdaIntegration,
            defaultMethodOptions: {
                authorizationType: apigateway.AuthorizationType.NONE,
            },
        });
        // Unauthenticated public route for health & availability check
        const authResource = api.root.addResource('auth');
        const checkAvailabilityResource = authResource.addResource('check-availability');
        checkAvailabilityResource.addMethod('GET', lambdaIntegration, {
            authorizationType: apigateway.AuthorizationType.NONE,
        });
        const healthResource = api.root.addResource('health');
        healthResource.addMethod('GET', lambdaIntegration, {
            authorizationType: apigateway.AuthorizationType.NONE,
        });
        const dbInitResource = api.root.addResource('db-init');
        dbInitResource.addMethod('GET', lambdaIntegration, {
            authorizationType: apigateway.AuthorizationType.NONE,
        });
        // ========================================================================
        // 12. S3 Frontend Hosting Bucket (Website Hosting)
        // ========================================================================
        const frontendBucket = new s3.Bucket(this, 'AdvitiyansFrontendBucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            publicReadAccess: true,
            blockPublicAccess: new s3.BlockPublicAccess({
                blockPublicAcls: false,
                blockPublicPolicy: false,
                ignorePublicAcls: false,
                restrictPublicBuckets: false,
            }),
            websiteIndexDocument: 'index.html',
            websiteErrorDocument: 'index.html',
            cors: [
                {
                    allowedOrigins: ['*'],
                    allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
                    allowedHeaders: ['*'],
                },
            ],
        });
        // ========================================================================
        // 13. CloudFront Distribution for HTTPS & CDN Acceleration
        // ========================================================================
        const cfDistribution = new cloudfront.Distribution(this, 'AdvitiyansCloudFront', {
            defaultBehavior: {
                origin: new origins.S3StaticWebsiteOrigin(frontendBucket),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            },
            defaultRootObject: 'index.html',
            errorResponses: [
                {
                    httpStatus: 404,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html',
                    ttl: cdk.Duration.seconds(0),
                },
                {
                    httpStatus: 403,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html',
                    ttl: cdk.Duration.seconds(0),
                },
            ],
        });
        // ========================================================================
        // Stack Outputs
        // ========================================================================
        // ========================================================================
        // 14. Notifier Lambda (outside the VPC — has internet, no NAT needed)
        //     API Lambda → S3 notify/outbox/*.json (free gateway endpoint) → this Lambda → Telegram / Web Push.
        //     Its Function URL is the Telegram webhook (verified with a secret header).
        // ========================================================================
        const notifierLambda = new lambda.Function(this, 'AdvitiyansNotifier', {
            runtime: lambda.Runtime.NODEJS_22_X,
            handler: 'handlers/notifier.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
            timeout: cdk.Duration.seconds(60),
            memorySize: 256,
            environment: {
                NOTIFY_BUCKET: uploadsBucket.bucketName,
                APP_URL: `https://${cfDistribution.distributionDomainName}`,
                TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
                VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || '',
                VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || '',
                VAPID_SUBJECT: 'mailto:admin@rgmcet.edu.in',
            },
        });
        uploadsBucket.grantReadWrite(notifierLambda, 'notify/*');
        uploadsBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(notifierLambda), { prefix: 'notify/outbox/' });
        const notifierUrl = notifierLambda.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE });
        // Daily 6:00 PM IST: absence alerts to subscribed parents / students, tomorrow's club sessions
        const dailyNotifyRule = new events.Rule(this, 'DailyNotifications', {
            schedule: events.Schedule.cron({ minute: '30', hour: '12', month: '*', weekDay: '*', year: '*' }),
            description: 'Queues daily absence alerts and club session reminders (6 PM IST).',
        });
        dailyNotifyRule.addTarget(new targets.LambdaFunction(apiLambda, {
            event: events.RuleTargetInput.fromObject({ job: 'daily-notify' }),
        }));
        new cdk.CfnOutput(this, 'NotifierUrl', { value: notifierUrl.url });
        new cdk.CfnOutput(this, 'ApiGatewayUrl', { value: api.url });
        new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
        new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
        new cdk.CfnOutput(this, 'FrontendWebsiteUrl', { value: frontendBucket.bucketWebsiteUrl });
        new cdk.CfnOutput(this, 'CloudFrontUrl', { value: `https://${cfDistribution.distributionDomainName}` });
        new cdk.CfnOutput(this, 'CloudFrontDistributionId', { value: cfDistribution.distributionId });
        new cdk.CfnOutput(this, 'FrontendBucketName', { value: frontendBucket.bucketName });
        new cdk.CfnOutput(this, 'UploadsBucketName', { value: uploadsBucket.bucketName });
        // RdsProxyEndpoint output removed — proxy deleted to save $22/month
        new cdk.CfnOutput(this, 'RdsEndpoint', { value: dbInstance.dbInstanceEndpointAddress });
        new cdk.CfnOutput(this, 'DbSecretArn', { value: dbSecret.secretArn });
    }
}
exports.AdvitiyansStack = AdvitiyansStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWR2aXRpeWFucy1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFkdml0aXlhbnMtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBRW5DLDJDQUEyQztBQUMzQywyQ0FBMkM7QUFDM0MsaUVBQWlFO0FBQ2pFLG1EQUFtRDtBQUNuRCxpREFBaUQ7QUFDakQseURBQXlEO0FBQ3pELHlDQUF5QztBQUN6Qyx5REFBeUQ7QUFDekQsOERBQThEO0FBQzlELDJDQUEyQztBQUMzQyxpREFBaUQ7QUFDakQsMERBQTBEO0FBQzFELHdEQUF3RDtBQUN4RCw2QkFBNkI7QUFFN0IsTUFBYSxlQUFnQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzVDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsMkVBQTJFO1FBQzNFLFNBQVM7UUFDVCwyRUFBMkU7UUFDM0UsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDN0MsTUFBTSxFQUFFLENBQUM7WUFDVCxXQUFXLEVBQUUsQ0FBQyxFQUFFLCtDQUErQztZQUMvRCxtQkFBbUIsRUFBRTtnQkFDbkI7b0JBQ0UsUUFBUSxFQUFFLEVBQUU7b0JBQ1osSUFBSSxFQUFFLFFBQVE7b0JBQ2QsVUFBVSxFQUFFLEdBQUcsQ0FBQyxVQUFVLENBQUMsTUFBTTtpQkFDbEM7Z0JBQ0Q7b0JBQ0UsUUFBUSxFQUFFLEVBQUU7b0JBQ1osSUFBSSxFQUFFLFVBQVU7b0JBQ2hCLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLGdCQUFnQjtpQkFDNUM7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILGlEQUFpRDtRQUNqRCxHQUFHLENBQUMsa0JBQWtCLENBQUMsWUFBWSxFQUFFO1lBQ25DLE9BQU8sRUFBRSxHQUFHLENB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MEIsRUFBRSxFQUFFLEtBQUssRUFBRSxjQUFjLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQztRQUM5RixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFLEVBQUUsS0FBSyxFQUFFLGNBQWMsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQ3BGLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUUsRUFBRSxLQUFLLEVBQUUsYUFBYSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDbEYsb0VBQW9FO1FBQ3BFLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFLEVBQUUsS0FBSyxFQUFFLFVBQVUsQ0FBQyx5QkFBeUIsRUFBRSxDQUFDLENBQUM7UUFDeEYsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUUsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7SUFDeEUsQ0FBQztDQUNGO0FBbmRELDBDQW1kQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIHJkcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtcmRzJztcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlcic7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQnO1xuaW1wb3J0ICogYXMgb3JpZ2lucyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udC1vcmlnaW5zJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzJztcbmltcG9ydCAqIGFzIHRhcmdldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cy10YXJnZXRzJztcbmltcG9ydCAqIGFzIHMzbiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMtbm90aWZpY2F0aW9ucyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG5leHBvcnQgY2xhc3MgQWR2aXRpeWFuc1N0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gMS4gVlBDXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgY29uc3QgdnBjID0gbmV3IGVjMi5WcGModGhpcywgJ0Fkdml0aXlhbnNWcGMnLCB7XG4gICAgICBtYXhBenM6IDIsXG4gICAgICBuYXRHYXRld2F5czogMCwgLy8gQ29zdCBvcHRpbWl6ZWQ6IGF2b2lkIE5hdEdhdGV3YXkgaG91cmx5IGNvc3RcbiAgICAgIHN1Ym5ldENvbmZpZ3VyYXRpb246IFtcbiAgICAgICAge1xuICAgICAgICAgIGNpZHJNYXNrOiAyNCxcbiAgICAgICAgICBuYW1lOiAnUHVibGljJyxcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QVUJMSUMsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBjaWRyTWFzazogMjQsXG4gICAgICAgICAgbmFtZTogJ0lzb2xhdGVkJyxcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVELFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIEdhdGV3YXkgRW5kcG9pbnRzIGZvciBTMyAoZnJlZSwgbm8gTkFUIG5lZWRlZClcbiAgICB2cGMuYWRkR2F0ZXdheUVuZHBvaW50KCdTM0VuZHBvaW50Jywge1xuICAgICAgc2VydmljZTogZWMyLkdhdGV3YXlWcGNFbmRwb2ludEF3c1NlcnZpY2UuUzMsXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyAyLiBTZWN1cml0eSBHcm91cHNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8vIExhbWJkYSBTZWN1cml0eSBHcm91cFxuICAgIGNvbnN0IGxhbWJkYVNnID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdMYW1iZGFTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgTGFtYmRhIGZ1bmN0aW9ucycsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZSxcbiAgICB9KTtcblxuICAgIC8vIFJEUyBJbnN0YW5jZSBTZWN1cml0eSBHcm91cFxuICAgIGNvbnN0IGRiU2cgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ1Jkc1NlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBSRFMgUG9zdGdyZVNRTCBpbnN0YW5jZScsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZSxcbiAgICB9KTtcblxuICAgIC8vIFZQQyBFbmRwb2ludCBTZWN1cml0eSBHcm91cFxuICAgIGNvbnN0IHZwY2VTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdWcGNlU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIFZQQyBJbnRlcmZhY2UgRW5kcG9pbnRzJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgLy8gLS0tIFNlY3VyaXR5IEdyb3VwIFJ1bGVzIC0tLVxuICAgIC8vIExhbWJkYSDihpIgUkRTIGRpcmVjdGx5IChwb3J0IDU0MzIpIOKAlCBubyBwcm94eVxuICAgIGxhbWJkYVNnLmFkZEVncmVzc1J1bGUoZGJTZywgZWMyLlBvcnQudGNwKDU0MzIpLCAnTGFtYmRhIGRpcmVjdCB0byBSRFMnKTtcbiAgICBkYlNnLmFkZEluZ3Jlc3NSdWxlKGxhbWJkYVNnLCBlYzIuUG9ydC50Y3AoNTQzMiksICdBbGxvdyBMYW1iZGEgZGlyZWN0IHRvIFJEUycpO1xuXG4gICAgLy8gTGFtYmRhIOKGkiBWUEMgRW5kcG9pbnRzIChwb3J0IDQ0MyBmb3IgU2VjcmV0cyBNYW5hZ2VyKVxuICAgIGxhbWJkYVNnLmFkZEVncmVzc1J1bGUodnBjZVNlY3VyaXR5R3JvdXAsIGVjMi5Qb3J0LnRjcCg0NDMpLCAnTGFtYmRhIHRvIFZQQyBFbmRwb2ludHMnKTtcbiAgICB2cGNlU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShsYW1iZGFTZywgZWMyLlBvcnQudGNwKDQ0MyksICdBbGxvdyBMYW1iZGEgdG8gVlBDIEVuZHBvaW50cycpO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gMy4gVlBDIEludGVyZmFjZSBFbmRwb2ludHNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFNlY3JldHMgTWFuYWdlciBlbmRwb2ludCDigJQgbmVlZGVkIGJ5IExhbWJkYSB0byBmZXRjaCBEQiBjcmVkZW50aWFsc1xuICAgIHZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludCgnU2VjcmV0c01hbmFnZXJFbmRwb2ludCcsIHtcbiAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuU0VDUkVUU19NQU5BR0VSLFxuICAgICAgc3VibmV0czogeyBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVEIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW3ZwY2VTZWN1cml0eUdyb3VwXSxcbiAgICAgIHByaXZhdGVEbnNFbmFibGVkOiB0cnVlLFxuICAgIH0pO1xuICAgIC8vIE5PVEU6IFNUUyBlbmRwb2ludCByZW1vdmVkIOKAlCB3YXMgb25seSBuZWVkZWQgZm9yIFJEUyBQcm94eSBJQU0gYXV0aCAocHJveHkgcmVtb3ZlZCkuXG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyA0LiBEYXRhYmFzZSBTZWNyZXRzIE1hbmFnZXJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBjb25zdCBkYlNlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0Fkdml0aXlhbnNEYlNlY3JldCcsIHtcbiAgICAgIHNlY3JldE5hbWU6ICdhZHZpdGl5YW5zLWRiLWNyZWRlbnRpYWxzJyxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7IHVzZXJuYW1lOiAncG9zdGdyZXMnIH0pLFxuICAgICAgICBnZW5lcmF0ZVN0cmluZ0tleTogJ3Bhc3N3b3JkJyxcbiAgICAgICAgZXhjbHVkZVB1bmN0dWF0aW9uOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIDUuIFJEUyBQb3N0Z3JlU1FMIEluc3RhbmNlIChkYi50My5sYXJnZSwgU2luZ2xlLUFaKVxuICAgIC8vICAgIFVwZ3JhZGVkIGZyb20gdDRnLm1pY3JvOiAxIEdCIFJBTSAvIDg3IGNvbm5lY3Rpb25zIOKGkiA4IEdCIFJBTSAvIDg1NSBjb25uZWN0aW9uc1xuICAgIC8vICAgIFN1cHBvcnRzIDEwLDAwMCBzdHVkZW50cyB3aXRob3V0IGNvbm5lY3Rpb24gZXhoYXVzdGlvbi5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBjb25zdCBkYkluc3RhbmNlID0gbmV3IHJkcy5EYXRhYmFzZUluc3RhbmNlKHRoaXMsICdBZHZpdGl5YW5zUkRTJywge1xuICAgICAgZW5naW5lOiByZHMuRGF0YWJhc2VJbnN0YW5jZUVuZ2luZS5wb3N0Z3Jlcyh7XG4gICAgICAgIHZlcnNpb246IHJkcy5Qb3N0Z3Jlc0VuZ2luZVZlcnNpb24uVkVSXzE1LFxuICAgICAgfSksXG4gICAgICBpbnN0YW5jZVR5cGU6IGVjMi5JbnN0YW5jZVR5cGUub2YoZWMyLkluc3RhbmNlQ2xhc3MuVDMsIGVjMi5JbnN0YW5jZVNpemUuTEFSR0UpLFxuICAgICAgdnBjLFxuICAgICAgdnBjU3VibmV0czogeyBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVEIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW2RiU2ddLFxuICAgICAgYWxsb2NhdGVkU3RvcmFnZTogMzAsXG4gICAgICBtYXhBbGxvY2F0ZWRTdG9yYWdlOiAxMDAsXG4gICAgICBjcmVkZW50aWFsczogcmRzLkNyZWRlbnRpYWxzLmZyb21TZWNyZXQoZGJTZWNyZXQpLFxuICAgICAgZGF0YWJhc2VOYW1lOiAnYWR2aXRpeWFucycsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sICAgICAgICAgIC8vIFByb3RlY3QgZGF0YSBmcm9tIGFjY2lkZW50YWwgY2RrIGRlc3Ryb3lcbiAgICAgIGF1dG9NaW5vclZlcnNpb25VcGdyYWRlOiB0cnVlLFxuICAgICAgcHVibGljbHlBY2Nlc3NpYmxlOiBmYWxzZSxcbiAgICAgIGJhY2t1cFJldGVudGlvbjogY2RrLkR1cmF0aW9uLmRheXMoNyksICAgICAgICAgICAgIC8vIERhaWx5IGF1dG9tYXRlZCBzbmFwc2hvdHMgKGZyZWUpXG4gICAgICBkZWxldGlvblByb3RlY3Rpb246IHRydWUsICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBQcmV2ZW50IGFjY2lkZW50YWwgZGVsZXRlIHZpYSBjb25zb2xlXG4gICAgICBlbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzOiB0cnVlLCAgICAgICAgICAgICAgICAgICAvLyBGUkVFIG9uIHQzLmxhcmdlIOKAlCA3LWRheSBxdWVyeSBhbmFseXNpc1xuICAgICAgbW9uaXRvcmluZ0ludGVydmFsOiBjZGsuRHVyYXRpb24uc2Vjb25kcyg2MCksICAgICAgLy8gRW5oYW5jZWQgTW9uaXRvcmluZyDigJQgT1MtbGV2ZWwgbWV0cmljcyBldmVyeSA2MHMgKH4kMC41MC9tbylcbiAgICAgIC8vIE5PVEU6IHN0b3JhZ2VFbmNyeXB0ZWQgY2Fubm90IGJlIGVuYWJsZWQgb24gYW4gZXhpc3RpbmcgdW5lbmNyeXB0ZWQgaW5zdGFuY2UuXG4gICAgICAvLyBJdCByZXF1aXJlcyBhIHJlcGxhY2UgKHNuYXBzaG90ICsgcmVzdG9yZSkuIFNraXBwaW5nIHRvIGF2b2lkIGRhdGEgbG9zcyByaXNrLlxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gNi4gUkRTIFByb3h5IOKAlCBSRU1PVkVEIChzYXZlcyAkMjIvbW9udGgpXG4gICAgLy8gICAgV2l0aCBkYi50My5sYXJnZSAoODU1IG1heCBjb25uZWN0aW9ucykgYW5kIExhbWJkYSBwb29sIG1heD0xIHBlclxuICAgIC8vICAgIGluc3RhbmNlLCByZXNlcnZlZCBjb25jdXJyZW5jeSAyMDAg4oaSIG1heCAyMDAgREIgY29ubmVjdGlvbnMgdG90YWwuXG4gICAgLy8gICAgMjAwIDw8IDg1NSwgc28gdGhlIHByb3h5IGlzIHJlZHVuZGFudCBhbmQgY29zdHMgbW9uZXkgZm9yIG5vdGhpbmcuXG4gICAgLy8gICAgTGFtYmRhIG5vdyBjb25uZWN0cyBkaXJlY3RseSB0byB0aGUgUkRTIGluc3RhbmNlIGVuZHBvaW50LlxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gNy4gUHJlIFNpZ24tVXAgTGFtYmRhIFRyaWdnZXJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBjb25zdCBwcmVTaWduVXBMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdDb2duaXRvUHJlU2lnblVwVHJpZ2dlcicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXJzL2NvZ25pdG8tcHJlLXNpZ251cC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYmFja2VuZC9kaXN0JykpLFxuICAgICAgdnBjLFxuICAgICAgdnBjU3VibmV0czogeyBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVEIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW2xhbWJkYVNnXSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIERCX0hPU1Q6IGRiSW5zdGFuY2UuZGJJbnN0YW5jZUVuZHBvaW50QWRkcmVzcywgIC8vIERpcmVjdCBSRFMg4oCUIHByb3h5IHJlbW92ZWRcbiAgICAgICAgREJfUE9SVDogJzU0MzInLFxuICAgICAgICBEQl9OQU1FOiAnYWR2aXRpeWFucycsXG4gICAgICAgIERCX1VTRVI6ICdwb3N0Z3JlcycsXG4gICAgICAgIERCX1NFQ1JFVF9BUk46IGRiU2VjcmV0LnNlY3JldEFybixcbiAgICAgICAgREJfU1NMOiAndHJ1ZScsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIGRiU2VjcmV0LmdyYW50UmVhZChwcmVTaWduVXBMYW1iZGEpO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gOC4gQ29nbml0byBVc2VyIFBvb2xcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBjb25zdCB1c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsICdBZHZpdGl5YW5zVXNlclBvb2wnLCB7XG4gICAgICB1c2VyUG9vbE5hbWU6ICdhZHZpdGl5YW5zLXVzZXItcG9vbCcsXG4gICAgICBzZWxmU2lnblVwRW5hYmxlZDogdHJ1ZSxcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHsgZW1haWw6IHRydWUgfSxcbiAgICAgIGF1dG9WZXJpZnk6IHsgZW1haWw6IHRydWUgfSxcbiAgICAgIHBhc3N3b3JkUG9saWN5OiB7XG4gICAgICAgIG1pbkxlbmd0aDogOCxcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVVwcGVyY2FzZTogZmFsc2UsXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXG4gICAgICAgIHJlcXVpcmVTeW1ib2xzOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICBjdXN0b21BdHRyaWJ1dGVzOiB7XG4gICAgICAgIHJvbGU6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7IG11dGFibGU6IHRydWUgfSksXG4gICAgICAgIHJlZ19ubzogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcbiAgICAgICAgeWVhcjogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcbiAgICAgIH0sXG4gICAgICAvLyDilIDilIAgUGFzc3dvcmQgUmVzZXQgT1RQIEVtYWlsIFRlbXBsYXRlIOKUgOKUgFxuICAgICAgdXNlclZlcmlmaWNhdGlvbjoge1xuICAgICAgICBlbWFpbFN1YmplY3Q6ICdPVFAgZm9yIFJHTSBNYW5hZ2VCQUMg4oCTIFlvdXIgT25lLVRpbWUgUGFzc3dvcmQnLFxuICAgICAgICBlbWFpbEJvZHk6XG4gICAgICAgICAgJ0RlYXIgRmFjdWx0eSxcXG5cXG4nICtcbiAgICAgICAgICAnWW91IHJlcXVlc3RlZCBhIHBhc3N3b3JkIHJlc2V0IGZvciB5b3VyIFJHTSBNYW5hZ2VCQUMgYWNjb3VudCAoe3VzZXJuYW1lfSkuXFxuXFxuJyArXG4gICAgICAgICAgJ1lvdXIgT25lLVRpbWUgUGFzc3dvcmQgKE9UUCkgaXM6XFxuXFxuJyArXG4gICAgICAgICAgJ3sjIyMjfVxcblxcbicgK1xuICAgICAgICAgICdUaGlzIE9UUCBpcyB2YWxpZCBmb3IgMSBob3VyLiBEbyBub3Qgc2hhcmUgaXQgd2l0aCBhbnlvbmUuXFxuXFxuJyArXG4gICAgICAgICAgJ0lmIHlvdSBkaWQgbm90IHJlcXVlc3QgdGhpcywgcGxlYXNlIGlnbm9yZSB0aGlzIGVtYWlsLlxcblxcbicgK1xuICAgICAgICAgICdSZWdhcmRzLFxcblJHTSBNYW5hZ2VCQUMgU3lzdGVtXFxuUkdNIENvbGxlZ2Ugb2YgRW5naW5lZXJpbmcgJiBUZWNobm9sb2d5JyxcbiAgICAgICAgZW1haWxTdHlsZTogY29nbml0by5WZXJpZmljYXRpb25FbWFpbFN0eWxlLkNPREUsXG4gICAgICB9LFxuICAgICAgbGFtYmRhVHJpZ2dlcnM6IHtcbiAgICAgICAgcHJlU2lnblVwOiBwcmVTaWduVXBMYW1iZGEsXG4gICAgICB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHVzZXJQb29sQ2xpZW50ID0gbmV3IGNvZ25pdG8uVXNlclBvb2xDbGllbnQodGhpcywgJ0Fkdml0aXlhbnNVc2VyUG9vbENsaWVudCcsIHtcbiAgICAgIHVzZXJQb29sLFxuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiAnYWR2aXRpeWFucy13ZWItY2xpZW50JyxcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSxcbiAgICAgIGF1dGhGbG93czoge1xuICAgICAgICB1c2VyU3JwOiB0cnVlLFxuICAgICAgICBjdXN0b206IHRydWUsXG4gICAgICAgIGFkbWluVXNlclBhc3N3b3JkOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIDkuIFMzIFVwbG9hZHMgQnVja2V0IChjcmVhdGVkIGJlZm9yZSBMYW1iZGEgc28gZW52IHZhciBjYW4gcmVmZXJlbmNlIGl0KVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNvbnN0IHVwbG9hZHNCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdBZHZpdGl5YW5zVXBsb2Fkc0J1Y2tldCcsIHtcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgIGNvcnM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBbczMuSHR0cE1ldGhvZHMuR0VULCBzMy5IdHRwTWV0aG9kcy5QVVQsIHMzLkh0dHBNZXRob2RzLlBPU1RdLFxuICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBbJyonXSxcbiAgICAgICAgICBhbGxvd2VkSGVhZGVyczogWycqJ10sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gMTAuIEJhY2tlbmQgQVBJIExhbWJkYSBGdW5jdGlvbiAoaW4gVlBDLCBjb25uZWN0cyB2aWEgUkRTIFByb3h5KVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIEhNQUMga2V5IGZvciBzZXJ2ZXItc2lnbmVkIHNlc3Npb24gdG9rZW5zIChhZG1pbi9IT0Qvb3ZlcnNpZ2h0L3BhcmVudC9EQi1wYXNzd29yZCBsb2dpbnMpLlxuICAgIC8vIEdlbmVyYXRlZCBvbmNlIGJ5IFNlY3JldHMgTWFuYWdlcjsgbmV2ZXIgc3RvcmVkIGluIHRoZSByZXBvIG9yIGluIEdpdEh1YiBTZWNyZXRzLlxuICAgIGNvbnN0IHNlc3Npb25TaWduaW5nU2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnQWR2aXRpeWFuc1Nlc3Npb25TaWduaW5nU2VjcmV0Jywge1xuICAgICAgZGVzY3JpcHRpb246ICdITUFDIGtleSBmb3IgQWR2aXRpeWFucyBzZXJ2ZXItc2lnbmVkIHNlc3Npb24gdG9rZW5zJyxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7IHBhc3N3b3JkTGVuZ3RoOiA2NCwgZXhjbHVkZVB1bmN0dWF0aW9uOiB0cnVlIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG5cbiAgICBjb25zdCBhcGlMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdBZHZpdGl5YW5zQXBpSGFuZGxlcicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXJzL2FwaS5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYmFja2VuZC9kaXN0JykpLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoOTAwKSwgICAgICAgLy8gTWF4IDE1IG1pbnMgZm9yIEV2ZW50QnJpZGdlIENyb24uIEFQSSBHYXRld2F5IHdpbGwgc3RpbGwgZHJvcCBhdCAyOXMuXG4gICAgICBtZW1vcnlTaXplOiA1MTIsICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAyw5cgQ1BVIHNwZWVkIHZzIDI1NiBNQjsgcnVucyB+MzUlIGZhc3RlclxuICAgICAgLy8gQWNjb3VudCBsaW1pdCBpcyBub3cgMSwwMDAgY29uY3VycmVudCBleGVjdXRpb25zLiBDYXAgdGhlIEFQSSBhdCAzMDAgY29waWVzIHNvIHRoZVxuICAgICAgLy8gZGF0YWJhc2UgKHQzLmxhcmdlLCB+ODU1IGNvbm5lY3Rpb25zKSBjYW4gbmV2ZXIgcnVuIG91dDogMzAwIMOXIHBvb2wgbWF4IDIgPSA2MDAuXG4gICAgICAvLyBMZWF2ZXMgNzAwIGZvciB0aGUgbm90aWZpZXIgYW5kIG90aGVyIGZ1bmN0aW9ucyAoQVdTIG5lZWRzIGF0IGxlYXN0IDEwMCB1bnJlc2VydmVkKS5cbiAgICAgIHJlc2VydmVkQ29uY3VycmVudEV4ZWN1dGlvbnM6IDMwMCxcbiAgICAgIHZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHsgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtsYW1iZGFTZ10sXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBEQl9IT1NUOiBkYkluc3RhbmNlLmRiSW5zdGFuY2VFbmRwb2ludEFkZHJlc3MsICAvLyBEaXJlY3QgUkRTIOKAlCBwcm94eSByZW1vdmVkXG4gICAgICAgIERCX1BPUlQ6ICc1NDMyJyxcbiAgICAgICAgREJfTkFNRTogJ2Fkdml0aXlhbnMnLFxuICAgICAgICBEQl9VU0VSOiAncG9zdGdyZXMnLFxuICAgICAgICBEQl9TRUNSRVRfQVJOOiBkYlNlY3JldC5zZWNyZXRBcm4sXG4gICAgICAgIERCX1NTTDogJ3RydWUnLFxuICAgICAgICBDT0dOSVRPX1VTRVJfUE9PTF9JRDogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgICAgQ09HTklUT19DTElFTlRfSUQ6IHVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICAgIFVQTE9BRFNfQlVDS0VUX05BTUU6IHVwbG9hZHNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgVVNFX01PQ0s6ICdmYWxzZScsXG4gICAgICAgIC8vIEFkbWluL0hPRCBjcmVkZW50aWFscyDigJQgc291cmNlZCBmcm9tIEdpdEh1YiBTZWNyZXRzLCBuZXZlciBoYXJkY29kZWQgaW4gZnJvbnRlbmRcbiAgICAgICAgQURNSU5fTUFTVEVSX0VNQUlMOiBwcm9jZXNzLmVudi5BRE1JTl9NQVNURVJfRU1BSUwgfHwgJ2FkbWluQHJnbWNldC5lZHUuaW4nLFxuICAgICAgICBBRE1JTl9NQVNURVJfUEFTUzogcHJvY2Vzcy5lbnYuQURNSU5fTUFTVEVSX1BBU1MgfHwgJycsXG4gICAgICAgIEhPRF9NQVNURVJfRU1BSUw6IHByb2Nlc3MuZW52LkhPRF9NQVNURVJfRU1BSUwgfHwgJ2hvZGNzZWRzQHJnbWNldC5lZHUuaW4nLFxuICAgICAgICBIT0RfTUFTVEVSX1BBU1M6IHByb2Nlc3MuZW52LkhPRF9NQVNURVJfUEFTUyB8fCAnJyxcbiAgICAgICAgLy8gU2VjcmV0IGZvciBwcm90ZWN0aW5nIC9kYi1pbml0IGFuZCAvZGItbWlncmF0ZSBlbmRwb2ludHNcbiAgICAgICAgQURNSU5fU0VDUkVUOiBwcm9jZXNzLmVudi5BRE1JTl9TRUNSRVQgfHwgJycsXG4gICAgICAgIC8vIEZhY3VsdHkgcmVnaXN0cmF0aW9uIHNlY3VyaXR5IGtleSDigJQgcmVxdWlyZWQgZm9yIGZhY3VsdHkvSE9EIHNlbGYtcmVnaXN0cmF0aW9uXG4gICAgICAgIEZBQ1VMVFlfU0VDUkVUX0tFWTogcHJvY2Vzcy5lbnYuRkFDVUxUWV9TRUNSRVRfS0VZIHx8ICcnLFxuICAgICAgICBHSVRIVUJfUEFUOiBwcm9jZXNzLmVudi5HSVRIVUJfUEFUIHx8ICcnLFxuICAgICAgICAvLyBSZXNvbHZlZCBieSBDbG91ZEZvcm1hdGlvbiBhdCBkZXBsb3kgdGltZSAoZHluYW1pYyByZWZlcmVuY2UpIOKAlCB2YWx1ZSBuZXZlciBhcHBlYXJzIGluIHRoZSB0ZW1wbGF0ZVxuICAgICAgICBTRVNTSU9OX1NJR05JTkdfU0VDUkVUOiBzZXNzaW9uU2lnbmluZ1NlY3JldC5zZWNyZXRWYWx1ZS51bnNhZmVVbndyYXAoKSxcbiAgICAgICAgLy8gTm90aWZpY2F0aW9uczogcHVibGljIGhhbHZlcyBvbmx5IOKAlCB0aGUgbm90aWZpZXIgTGFtYmRhIGhvbGRzIHRoZSBwcml2YXRlIGtleXMgLyBib3QgdG9rZW5cbiAgICAgICAgVkFQSURfUFVCTElDX0tFWTogcHJvY2Vzcy5lbnYuVkFQSURfUFVCTElDX0tFWSB8fCAnJyxcbiAgICAgICAgVEVMRUdSQU1fQk9UX1VTRVJOQU1FOiBwcm9jZXNzLmVudi5URUxFR1JBTV9CT1RfVVNFUk5BTUUgfHwgJycsXG4gICAgICAgIEJVSUxEX1RJTUVTVEFNUDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBkYlNlY3JldC5ncmFudFJlYWQoYXBpTGFtYmRhKTtcbiAgICB1cGxvYWRzQnVja2V0LmdyYW50UmVhZFdyaXRlKGFwaUxhbWJkYSk7XG4gICAgLy8gTk9URTogcmRzUHJveHkuZ3JhbnRDb25uZWN0IHJlbW92ZWQg4oCUIHByb3h5IGRlbGV0ZWQuIExhbWJkYSB1c2VzIHBhc3N3b3JkIGF1dGggdmlhIFNlY3JldHMgTWFuYWdlci5cblxuICAgIC8vIEdyYW50IExhbWJkYSBwZXJtaXNzaW9uIHRvIGRlbGV0ZSBhbmQgbWFuYWdlIHVzZXJzIGluIENvZ25pdG8gVXNlciBQb29sXG4gICAgYXBpTGFtYmRhLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdjb2duaXRvLWlkcDpBZG1pbkRlbGV0ZVVzZXInLFxuICAgICAgICAnY29nbml0by1pZHA6QWRtaW5HZXRVc2VyJyxcbiAgICAgICAgJ2NvZ25pdG8taWRwOkFkbWluRGlzYWJsZVVzZXInLFxuICAgICAgICAnY29nbml0by1pZHA6TGlzdFVzZXJzJyxcbiAgICAgICAgLy8gUmVxdWlyZWQgZm9yIHNlcnZlci1zaWRlIHNpZ24taW4gKFBPU1QgL2F1dGgvY29nbml0by1zaWduaW4pXG4gICAgICAgICdjb2duaXRvLWlkcDpBZG1pbkluaXRpYXRlQXV0aCcsXG4gICAgICAgIC8vIFJlcXVpcmVkIGZvciBwYXNzd29yZCBzeW5jIGFuZCBhY2NvdW50IGhlYWxpbmdcbiAgICAgICAgJ2NvZ25pdG8taWRwOkFkbWluU2V0VXNlclBhc3N3b3JkJyxcbiAgICAgICAgLy8gUmVxdWlyZWQgZm9yIGNyZWF0aW5nIENvZ25pdG8gYWNjb3VudHMgZm9yIERCLW9ubHkgc3R1ZGVudHNcbiAgICAgICAgJ2NvZ25pdG8taWRwOkFkbWluQ3JlYXRlVXNlcicsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbdXNlclBvb2wudXNlclBvb2xBcm5dLFxuICAgIH0pKTtcblxuICAgIC8vIE5pZ2h0bHkgQ3JvbiBKb2IgKDEyOjAwIEFNIElTVCA9IDE4OjMwIFVUQykgZm9yIEF1dG8tU3luY1xuICAgIGNvbnN0IG5pZ2h0bHlTeW5jUnVsZSA9IG5ldyBldmVudHMuUnVsZSh0aGlzLCAnTmlnaHRseUNvZGluZ1Byb2ZpbGVTeW5jJywge1xuICAgICAgc2NoZWR1bGU6IGV2ZW50cy5TY2hlZHVsZS5jcm9uKHsgbWludXRlOiAnMzAnLCBob3VyOiAnMTgnLCBtb250aDogJyonLCB3ZWVrRGF5OiAnKicsIHllYXI6ICcqJyB9KSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVHJpZ2dlcnMgdGhlIEFQSSBMYW1iZGEgZXZlcnkgbmlnaHQgYXQgMTIgQU0gSVNUIHRvIGJhdGNoIHN5bmMgc3RhbGUgTGVldENvZGUgYW5kIEdpdEh1YiBjb2RpbmcgcHJvZmlsZXMuJyxcbiAgICB9KTtcbiAgICBuaWdodGx5U3luY1J1bGUuYWRkVGFyZ2V0KG5ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKGFwaUxhbWJkYSkpO1xuXG4gICAgLy8gS2VlcC13YXJtOiBwaW5nIHRoZSBBUEkgTGFtYmRhIGV2ZXJ5IDUgbWludXRlcyBzbyB0aGUgZmlyc3QgbG9naW4gYWZ0ZXIgYSBxdWlldCBzcGVsbFxuICAgIC8vIGRvZXNuJ3QgcGF5IHRoZSBjb2xkLXN0YXJ0IGNvc3QgKGJ1bmRsZSBsb2FkICsgU2VjcmV0cyBNYW5hZ2VyICsgREIgVExTIGhhbmRzaGFrZSkuXG4gICAgY29uc3Qga2VlcFdhcm1SdWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdBcGlLZWVwV2FybScsIHtcbiAgICAgIHNjaGVkdWxlOiBldmVudHMuU2NoZWR1bGUucmF0ZShjZGsuRHVyYXRpb24ubWludXRlcyg1KSksXG4gICAgICBkZXNjcmlwdGlvbjogJ0tlZXBzIG9uZSBBUEkgTGFtYmRhIGluc3RhbmNlIGFuZCBpdHMgREIgY29ubmVjdGlvbiB3YXJtLicsXG4gICAgfSk7XG4gICAga2VlcFdhcm1SdWxlLmFkZFRhcmdldChuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbihhcGlMYW1iZGEsIHtcbiAgICAgIGV2ZW50OiBldmVudHMuUnVsZVRhcmdldElucHV0LmZyb21PYmplY3QoeyB3YXJtdXA6IHRydWUgfSksXG4gICAgfSkpO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gMTEuIEFQSSBHYXRld2F5IFJFU1QgQVBJXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgY29uc3QgYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnQWR2aXRpeWFuc1Jlc3RBcGknLCB7XG4gICAgICByZXN0QXBpTmFtZTogJ0Fkdml0aXlhbnMgUGxhY2VtZW50IFJlYWRpbmVzcyBBUEknLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgZm9yIEFkdml0aXlhbnMgU3R1ZGVudCAzNjAgcGxhdGZvcm0gKGRpcmVjdCBSRFMgY29ubmVjdGlvbiknLFxuICAgICAgZGVwbG95T3B0aW9uczoge1xuICAgICAgICB0aHJvdHRsaW5nQnVyc3RMaW1pdDogMjAwMCwgICAgIC8vIEFic29yYnMgYSBidXJzdCBvZiB+MjAwMCByZXF1ZXN0cyAoYSB3aG9sZSBiYXRjaCBsb2dnaW5nIGluIHRvZ2V0aGVyKVxuICAgICAgICB0aHJvdHRsaW5nUmF0ZUxpbWl0OiAxMDAwLCAgICAgIC8vIFN1c3RhaW5lZCAxMDAwIHJlcXVlc3RzL3NlY29uZCAobG9hZCB0ZXN0OiAzMDAvcyBjYXAgdGhyZXcgNDI5cyBhdCA1MDAvcylcbiAgICAgICAgbWV0cmljc0VuYWJsZWQ6IHRydWUsICAgICAgICAgICAvLyBFbmFibGVzIGZyZWUgQ2xvdWRXYXRjaCBtZXRyaWNzIGRhc2hib2FyZFxuICAgICAgfSxcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUyxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBhcGlnYXRld2F5LkNvcnMuQUxMX01FVEhPRFMsXG4gICAgICAgIGFsbG93SGVhZGVyczogYXBpZ2F0ZXdheS5Db3JzLkRFRkFVTFRfSEVBREVSUy5jb25jYXQoWyd4LWFkbWluLXNlY3JldCcsICdjYWxsZXJfZW1haWwnLCAneC1jYWxsZXItZW1haWwnLCAnWC1SZXF1ZXN0ZWQtV2l0aCddKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBhcGkuYWRkR2F0ZXdheVJlc3BvbnNlKCdEZWZhdWx0NFhYJywge1xuICAgICAgdHlwZTogYXBpZ2F0ZXdheS5SZXNwb25zZVR5cGUuREVGQVVMVF80WFgsXG4gICAgICByZXNwb25zZUhlYWRlcnM6IHtcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IFwiJyonXCIsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogXCInKidcIixcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiBcIicqJ1wiLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGFwaS5hZGRHYXRld2F5UmVzcG9uc2UoJ0RlZmF1bHQ1WFgnLCB7XG4gICAgICB0eXBlOiBhcGlnYXRld2F5LlJlc3BvbnNlVHlwZS5ERUZBVUxUXzVYWCxcbiAgICAgIHJlc3BvbnNlSGVhZGVyczoge1xuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogXCInKidcIixcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiBcIicqJ1wiLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6IFwiJyonXCIsXG4gICAgICB9LFxuICAgIH0pO1xuXG5cbiAgICBjb25zdCBsYW1iZGFJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGFwaUxhbWJkYSk7XG5cbiAgICAvLyBSb290IEdFVCAvIG1ldGhvZCDigJQgc2VydmVzIHRoZSBmcm9udGVuZCBpbmRleC5odG1sIG92ZXIgSFRUUFNcbiAgICBhcGkucm9vdC5hZGRNZXRob2QoJ0dFVCcsIGxhbWJkYUludGVncmF0aW9uLCB7XG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5OT05FLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcHJveHlSZXNvdXJjZSA9IGFwaS5yb290LmFkZFByb3h5KHtcbiAgICAgIGRlZmF1bHRJbnRlZ3JhdGlvbjogbGFtYmRhSW50ZWdyYXRpb24sXG4gICAgICBkZWZhdWx0TWV0aG9kT3B0aW9uczoge1xuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5OT05FLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFVuYXV0aGVudGljYXRlZCBwdWJsaWMgcm91dGUgZm9yIGhlYWx0aCAmIGF2YWlsYWJpbGl0eSBjaGVja1xuICAgIGNvbnN0IGF1dGhSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdhdXRoJyk7XG4gICAgY29uc3QgY2hlY2tBdmFpbGFiaWxpdHlSZXNvdXJjZSA9IGF1dGhSZXNvdXJjZS5hZGRSZXNvdXJjZSgnY2hlY2stYXZhaWxhYmlsaXR5Jyk7XG4gICAgY2hlY2tBdmFpbGFiaWxpdHlSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGxhbWJkYUludGVncmF0aW9uLCB7XG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5OT05FLFxuICAgIH0pO1xuXG4gICAgY29uc3QgaGVhbHRoUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnaGVhbHRoJyk7XG4gICAgaGVhbHRoUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBsYW1iZGFJbnRlZ3JhdGlvbiwge1xuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuTk9ORSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGRiSW5pdFJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2RiLWluaXQnKTtcbiAgICBkYkluaXRSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGxhbWJkYUludGVncmF0aW9uLCB7XG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5OT05FLFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gMTIuIFMzIEZyb250ZW5kIEhvc3RpbmcgQnVja2V0IChXZWJzaXRlIEhvc3RpbmcpXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgY29uc3QgZnJvbnRlbmRCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdBZHZpdGl5YW5zRnJvbnRlbmRCdWNrZXQnLCB7XG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gICAgICBwdWJsaWNSZWFkQWNjZXNzOiB0cnVlLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IG5ldyBzMy5CbG9ja1B1YmxpY0FjY2Vzcyh7XG4gICAgICAgIGJsb2NrUHVibGljQWNsczogZmFsc2UsXG4gICAgICAgIGJsb2NrUHVibGljUG9saWN5OiBmYWxzZSxcbiAgICAgICAgaWdub3JlUHVibGljQWNsczogZmFsc2UsXG4gICAgICAgIHJlc3RyaWN0UHVibGljQnVja2V0czogZmFsc2UsXG4gICAgICB9KSxcbiAgICAgIHdlYnNpdGVJbmRleERvY3VtZW50OiAnaW5kZXguaHRtbCcsXG4gICAgICB3ZWJzaXRlRXJyb3JEb2N1bWVudDogJ2luZGV4Lmh0bWwnLFxuICAgICAgY29yczogW1xuICAgICAgICB7XG4gICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IFsnKiddLFxuICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBbczMuSHR0cE1ldGhvZHMuR0VULCBzMy5IdHRwTWV0aG9kcy5IRUFEXSxcbiAgICAgICAgICBhbGxvd2VkSGVhZGVyczogWycqJ10sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gMTMuIENsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIGZvciBIVFRQUyAmIENETiBBY2NlbGVyYXRpb25cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBjb25zdCBjZkRpc3RyaWJ1dGlvbiA9IG5ldyBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbih0aGlzLCAnQWR2aXRpeWFuc0Nsb3VkRnJvbnQnLCB7XG4gICAgICBkZWZhdWx0QmVoYXZpb3I6IHtcbiAgICAgICAgb3JpZ2luOiBuZXcgb3JpZ2lucy5TM1N0YXRpY1dlYnNpdGVPcmlnaW4oZnJvbnRlbmRCdWNrZXQpLFxuICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgIH0sXG4gICAgICBkZWZhdWx0Um9vdE9iamVjdDogJ2luZGV4Lmh0bWwnLFxuICAgICAgZXJyb3JSZXNwb25zZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGh0dHBTdGF0dXM6IDQwNCxcbiAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcbiAgICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiAnL2luZGV4Lmh0bWwnLFxuICAgICAgICAgIHR0bDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMCksXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBodHRwU3RhdHVzOiA0MDMsXG4gICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiAyMDAsXG4gICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyxcbiAgICAgICAgICB0dGw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDApLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIFN0YWNrIE91dHB1dHNcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyAxNC4gTm90aWZpZXIgTGFtYmRhIChvdXRzaWRlIHRoZSBWUEMg4oCUIGhhcyBpbnRlcm5ldCwgbm8gTkFUIG5lZWRlZClcbiAgICAvLyAgICAgQVBJIExhbWJkYSDihpIgUzMgbm90aWZ5L291dGJveC8qLmpzb24gKGZyZWUgZ2F0ZXdheSBlbmRwb2ludCkg4oaSIHRoaXMgTGFtYmRhIOKGkiBUZWxlZ3JhbSAvIFdlYiBQdXNoLlxuICAgIC8vICAgICBJdHMgRnVuY3Rpb24gVVJMIGlzIHRoZSBUZWxlZ3JhbSB3ZWJob29rICh2ZXJpZmllZCB3aXRoIGEgc2VjcmV0IGhlYWRlcikuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgY29uc3Qgbm90aWZpZXJMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdBZHZpdGl5YW5zTm90aWZpZXInLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVycy9ub3RpZmllci5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYmFja2VuZC9kaXN0JykpLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTk9USUZZX0JVQ0tFVDogdXBsb2Fkc0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBBUFBfVVJMOiBgaHR0cHM6Ly8ke2NmRGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWV9YCxcbiAgICAgICAgVEVMRUdSQU1fQk9UX1RPS0VOOiBwcm9jZXNzLmVudi5URUxFR1JBTV9CT1RfVE9LRU4gfHwgJycsXG4gICAgICAgIFZBUElEX1BVQkxJQ19LRVk6IHByb2Nlc3MuZW52LlZBUElEX1BVQkxJQ19LRVkgfHwgJycsXG4gICAgICAgIFZBUElEX1BSSVZBVEVfS0VZOiBwcm9jZXNzLmVudi5WQVBJRF9QUklWQVRFX0tFWSB8fCAnJyxcbiAgICAgICAgVkFQSURfU1VCSkVDVDogJ21haWx0bzphZG1pbkByZ21jZXQuZWR1LmluJyxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgdXBsb2Fkc0J1Y2tldC5ncmFudFJlYWRXcml0ZShub3RpZmllckxhbWJkYSwgJ25vdGlmeS8qJyk7XG4gICAgdXBsb2Fkc0J1Y2tldC5hZGRFdmVudE5vdGlmaWNhdGlvbihzMy5FdmVudFR5cGUuT0JKRUNUX0NSRUFURUQsIG5ldyBzM24uTGFtYmRhRGVzdGluYXRpb24obm90aWZpZXJMYW1iZGEpLCB7IHByZWZpeDogJ25vdGlmeS9vdXRib3gvJyB9KTtcbiAgICBjb25zdCBub3RpZmllclVybCA9IG5vdGlmaWVyTGFtYmRhLmFkZEZ1bmN0aW9uVXJsKHsgYXV0aFR5cGU6IGxhbWJkYS5GdW5jdGlvblVybEF1dGhUeXBlLk5PTkUgfSk7XG5cbiAgICAvLyBEYWlseSA2OjAwIFBNIElTVDogYWJzZW5jZSBhbGVydHMgdG8gc3Vic2NyaWJlZCBwYXJlbnRzIC8gc3R1ZGVudHMsIHRvbW9ycm93J3MgY2x1YiBzZXNzaW9uc1xuICAgIGNvbnN0IGRhaWx5Tm90aWZ5UnVsZSA9IG5ldyBldmVudHMuUnVsZSh0aGlzLCAnRGFpbHlOb3RpZmljYXRpb25zJywge1xuICAgICAgc2NoZWR1bGU6IGV2ZW50cy5TY2hlZHVsZS5jcm9uKHsgbWludXRlOiAnMzAnLCBob3VyOiAnMTInLCBtb250aDogJyonLCB3ZWVrRGF5OiAnKicsIHllYXI6ICcqJyB9KSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUXVldWVzIGRhaWx5IGFic2VuY2UgYWxlcnRzIGFuZCBjbHViIHNlc3Npb24gcmVtaW5kZXJzICg2IFBNIElTVCkuJyxcbiAgICB9KTtcbiAgICBkYWlseU5vdGlmeVJ1bGUuYWRkVGFyZ2V0KG5ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKGFwaUxhbWJkYSwge1xuICAgICAgZXZlbnQ6IGV2ZW50cy5SdWxlVGFyZ2V0SW5wdXQuZnJvbU9iamVjdCh7IGpvYjogJ2RhaWx5LW5vdGlmeScgfSksXG4gICAgfSkpO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ05vdGlmaWVyVXJsJywgeyB2YWx1ZTogbm90aWZpZXJVcmwudXJsIH0pO1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlHYXRld2F5VXJsJywgeyB2YWx1ZTogYXBpLnVybCB9KTtcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xJZCcsIHsgdmFsdWU6IHVzZXJQb29sLnVzZXJQb29sSWQgfSk7XG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sQ2xpZW50SWQnLCB7IHZhbHVlOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkIH0pO1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdGcm9udGVuZFdlYnNpdGVVcmwnLCB7IHZhbHVlOiBmcm9udGVuZEJ1Y2tldC5idWNrZXRXZWJzaXRlVXJsIH0pO1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDbG91ZEZyb250VXJsJywgeyB2YWx1ZTogYGh0dHBzOi8vJHtjZkRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfWAgfSk7XG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Nsb3VkRnJvbnREaXN0cmlidXRpb25JZCcsIHsgdmFsdWU6IGNmRGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbklkIH0pO1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdGcm9udGVuZEJ1Y2tldE5hbWUnLCB7IHZhbHVlOiBmcm9udGVuZEJ1Y2tldC5idWNrZXROYW1lIH0pO1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVcGxvYWRzQnVja2V0TmFtZScsIHsgdmFsdWU6IHVwbG9hZHNCdWNrZXQuYnVja2V0TmFtZSB9KTtcbiAgICAvLyBSZHNQcm94eUVuZHBvaW50IG91dHB1dCByZW1vdmVkIOKAlCBwcm94eSBkZWxldGVkIHRvIHNhdmUgJDIyL21vbnRoXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Jkc0VuZHBvaW50JywgeyB2YWx1ZTogZGJJbnN0YW5jZS5kYkluc3RhbmNlRW5kcG9pbnRBZGRyZXNzIH0pO1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEYlNlY3JldEFybicsIHsgdmFsdWU6IGRiU2VjcmV0LnNlY3JldEFybiB9KTtcbiAgfVxufVxuIl19