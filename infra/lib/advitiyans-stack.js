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
            // NOTE: reservedConcurrentExecutions removed — account limit is only 10 total concurrent
            // executions. With t3.large (855 max DB connections) and only 10 max Lambda executions,
            // connection exhaustion is impossible. No reservation needed.
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
                throttlingBurstLimit: 1000, // Absorbs burst of up to 1000 simultaneous student logins
                throttlingRateLimit: 300, // Sustained 300 requests/second — well above normal usage
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWR2aXRpeWFucy1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFkdml0aXlhbnMtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBRW5DLDJDQUEyQztBQUMzQywyQ0FBMkM7QUFDM0MsaUVBQWlFO0FBQ2pFLG1EQUFtRDtBQUNuRCxpREFBaUQ7QUFDakQseURBQXlEO0FBQ3pELHlDQUF5QztBQUN6Qyx5REFBeUQ7QUFDekQsOERBQThEO0FBQzlELDJDQUEyQztBQUMzQyxpREFBaUQ7QUFDakQsMERBQTBEO0FBQzFELHdEQUF3RDtBQUN4RCw2QkFBNkI7QUFFN0IsTUFBYSxlQUFnQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzVDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsMkVBQTJFO1FBQzNFLFNBQVM7UUFDVCwyRUFBMkU7UUFDM0UsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDN0MsTUFBTSxFQUFFLENBQUM7WUFDVCxXQUFXLEVBQUUsQ0FBQyxFQUFFLCtDQUErQztZQUMvRCxtQkFBbUIsRUFBRTtnQkFDbkI7b0JBQ0UsUUFBUSxFQUFFLEVBQUU7b0JBQ1osSUFBSSxFQUFFLFFBQVE7b0JBQ2QsVUFBVSxFQUFFLEdBQUcsQ0FBQyxVQUFVLENBQUMsTUFBTTtpQkFDbEM7Z0JBQ0Q7b0JBQ0UsUUFBUSxFQUFFLEVBQUU7b0JBQ1osSUFBSSxFQUFFLFVBQVU7b0JBQ2hCLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLGdCQUFnQjtpQkFDNUM7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILGlEQUFpRDtRQUNqRCxHQUFHLENBQUMsa0JBQWtCLENBQUMsWUFBWSxFQUFFO1lBQ25DLE9BQU8sRUFBRSxHQUFHLENB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Y0FBYyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFDOUYsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRSxFQUFFLEtBQUssRUFBRSxjQUFjLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUNwRixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFLEVBQUUsS0FBSyxFQUFFLGFBQWEsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQ2xGLG9FQUFvRTtRQUNwRSxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRSxFQUFFLEtBQUssRUFBRSxVQUFVLENBQUMseUJBQXlCLEVBQUUsQ0FBQyxDQUFDO1FBQ3hGLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO0lBQ3hFLENBQUM7Q0FDRjtBQWxkRCwwQ0FrZEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XG5pbXBvcnQgKiBhcyByZHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXJkcyc7XG5pbXBvcnQgKiBhcyBzZWNyZXRzbWFuYWdlciBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc2VjcmV0c21hbmFnZXInO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBjbG91ZGZyb250IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250JztcbmltcG9ydCAqIGFzIG9yaWdpbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQtb3JpZ2lucyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBldmVudHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cyc7XG5pbXBvcnQgKiBhcyB0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMtdGFyZ2V0cyc7XG5pbXBvcnQgKiBhcyBzM24gZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzLW5vdGlmaWNhdGlvbnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuZXhwb3J0IGNsYXNzIEFkdml0aXlhbnNTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIDEuIFZQQ1xuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNvbnN0IHZwYyA9IG5ldyBlYzIuVnBjKHRoaXMsICdBZHZpdGl5YW5zVnBjJywge1xuICAgICAgbWF4QXpzOiAyLFxuICAgICAgbmF0R2F0ZXdheXM6IDAsIC8vIENvc3Qgb3B0aW1pemVkOiBhdm9pZCBOYXRHYXRld2F5IGhvdXJseSBjb3N0XG4gICAgICBzdWJuZXRDb25maWd1cmF0aW9uOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBjaWRyTWFzazogMjQsXG4gICAgICAgICAgbmFtZTogJ1B1YmxpYycsXG4gICAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFVCTElDLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgY2lkck1hc2s6IDI0LFxuICAgICAgICAgIG5hbWU6ICdJc29sYXRlZCcsXG4gICAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBHYXRld2F5IEVuZHBvaW50cyBmb3IgUzMgKGZyZWUsIG5vIE5BVCBuZWVkZWQpXG4gICAgdnBjLmFkZEdhdGV3YXlFbmRwb2ludCgnUzNFbmRwb2ludCcsIHtcbiAgICAgIHNlcnZpY2U6IGVjMi5HYXRld2F5VnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlMzLFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gMi4gU2VjdXJpdHkgR3JvdXBzXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBMYW1iZGEgU2VjdXJpdHkgR3JvdXBcbiAgICBjb25zdCBsYW1iZGFTZyA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnTGFtYmRhU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIExhbWJkYSBmdW5jdGlvbnMnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2UsXG4gICAgfSk7XG5cbiAgICAvLyBSRFMgSW5zdGFuY2UgU2VjdXJpdHkgR3JvdXBcbiAgICBjb25zdCBkYlNnID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdSZHNTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgUkRTIFBvc3RncmVTUUwgaW5zdGFuY2UnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2UsXG4gICAgfSk7XG5cbiAgICAvLyBWUEMgRW5kcG9pbnQgU2VjdXJpdHkgR3JvdXBcbiAgICBjb25zdCB2cGNlU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnVnBjZVNlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBWUEMgSW50ZXJmYWNlIEVuZHBvaW50cycsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZSxcbiAgICB9KTtcblxuICAgIC8vIC0tLSBTZWN1cml0eSBHcm91cCBSdWxlcyAtLS1cbiAgICAvLyBMYW1iZGEg4oaSIFJEUyBkaXJlY3RseSAocG9ydCA1NDMyKSDigJQgbm8gcHJveHlcbiAgICBsYW1iZGFTZy5hZGRFZ3Jlc3NSdWxlKGRiU2csIGVjMi5Qb3J0LnRjcCg1NDMyKSwgJ0xhbWJkYSBkaXJlY3QgdG8gUkRTJyk7XG4gICAgZGJTZy5hZGRJbmdyZXNzUnVsZShsYW1iZGFTZywgZWMyLlBvcnQudGNwKDU0MzIpLCAnQWxsb3cgTGFtYmRhIGRpcmVjdCB0byBSRFMnKTtcblxuICAgIC8vIExhbWJkYSDihpIgVlBDIEVuZHBvaW50cyAocG9ydCA0NDMgZm9yIFNlY3JldHMgTWFuYWdlcilcbiAgICBsYW1iZGFTZy5hZGRFZ3Jlc3NSdWxlKHZwY2VTZWN1cml0eUdyb3VwLCBlYzIuUG9ydC50Y3AoNDQzKSwgJ0xhbWJkYSB0byBWUEMgRW5kcG9pbnRzJyk7XG4gICAgdnBjZVNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUobGFtYmRhU2csIGVjMi5Qb3J0LnRjcCg0NDMpLCAnQWxsb3cgTGFtYmRhIHRvIFZQQyBFbmRwb2ludHMnKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIDMuIFZQQyBJbnRlcmZhY2UgRW5kcG9pbnRzXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBTZWNyZXRzIE1hbmFnZXIgZW5kcG9pbnQg4oCUIG5lZWRlZCBieSBMYW1iZGEgdG8gZmV0Y2ggREIgY3JlZGVudGlhbHNcbiAgICB2cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoJ1NlY3JldHNNYW5hZ2VyRW5kcG9pbnQnLCB7XG4gICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlNFQ1JFVFNfTUFOQUdFUixcbiAgICAgIHN1Ym5ldHM6IHsgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFt2cGNlU2VjdXJpdHlHcm91cF0sXG4gICAgICBwcml2YXRlRG5zRW5hYmxlZDogdHJ1ZSxcbiAgICB9KTtcbiAgICAvLyBOT1RFOiBTVFMgZW5kcG9pbnQgcmVtb3ZlZCDigJQgd2FzIG9ubHkgbmVlZGVkIGZvciBSRFMgUHJveHkgSUFNIGF1dGggKHByb3h5IHJlbW92ZWQpLlxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gNC4gRGF0YWJhc2UgU2VjcmV0cyBNYW5hZ2VyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgY29uc3QgZGJTZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdBZHZpdGl5YW5zRGJTZWNyZXQnLCB7XG4gICAgICBzZWNyZXROYW1lOiAnYWR2aXRpeWFucy1kYi1jcmVkZW50aWFscycsXG4gICAgICBnZW5lcmF0ZVNlY3JldFN0cmluZzoge1xuICAgICAgICBzZWNyZXRTdHJpbmdUZW1wbGF0ZTogSlNPTi5zdHJpbmdpZnkoeyB1c2VybmFtZTogJ3Bvc3RncmVzJyB9KSxcbiAgICAgICAgZ2VuZXJhdGVTdHJpbmdLZXk6ICdwYXNzd29yZCcsXG4gICAgICAgIGV4Y2x1ZGVQdW5jdHVhdGlvbjogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyA1LiBSRFMgUG9zdGdyZVNRTCBJbnN0YW5jZSAoZGIudDMubGFyZ2UsIFNpbmdsZS1BWilcbiAgICAvLyAgICBVcGdyYWRlZCBmcm9tIHQ0Zy5taWNybzogMSBHQiBSQU0gLyA4NyBjb25uZWN0aW9ucyDihpIgOCBHQiBSQU0gLyA4NTUgY29ubmVjdGlvbnNcbiAgICAvLyAgICBTdXBwb3J0cyAxMCwwMDAgc3R1ZGVudHMgd2l0aG91dCBjb25uZWN0aW9uIGV4aGF1c3Rpb24uXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgY29uc3QgZGJJbnN0YW5jZSA9IG5ldyByZHMuRGF0YWJhc2VJbnN0YW5jZSh0aGlzLCAnQWR2aXRpeWFuc1JEUycsIHtcbiAgICAgIGVuZ2luZTogcmRzLkRhdGFiYXNlSW5zdGFuY2VFbmdpbmUucG9zdGdyZXMoe1xuICAgICAgICB2ZXJzaW9uOiByZHMuUG9zdGdyZXNFbmdpbmVWZXJzaW9uLlZFUl8xNSxcbiAgICAgIH0pLFxuICAgICAgaW5zdGFuY2VUeXBlOiBlYzIuSW5zdGFuY2VUeXBlLm9mKGVjMi5JbnN0YW5jZUNsYXNzLlQzLCBlYzIuSW5zdGFuY2VTaXplLkxBUkdFKSxcbiAgICAgIHZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHsgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtkYlNnXSxcbiAgICAgIGFsbG9jYXRlZFN0b3JhZ2U6IDMwLFxuICAgICAgbWF4QWxsb2NhdGVkU3RvcmFnZTogMTAwLFxuICAgICAgY3JlZGVudGlhbHM6IHJkcy5DcmVkZW50aWFscy5mcm9tU2VjcmV0KGRiU2VjcmV0KSxcbiAgICAgIGRhdGFiYXNlTmFtZTogJ2Fkdml0aXlhbnMnLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLCAgICAgICAgICAvLyBQcm90ZWN0IGRhdGEgZnJvbSBhY2NpZGVudGFsIGNkayBkZXN0cm95XG4gICAgICBhdXRvTWlub3JWZXJzaW9uVXBncmFkZTogdHJ1ZSxcbiAgICAgIHB1YmxpY2x5QWNjZXNzaWJsZTogZmFsc2UsXG4gICAgICBiYWNrdXBSZXRlbnRpb246IGNkay5EdXJhdGlvbi5kYXlzKDcpLCAgICAgICAgICAgICAvLyBEYWlseSBhdXRvbWF0ZWQgc25hcHNob3RzIChmcmVlKVxuICAgICAgZGVsZXRpb25Qcm90ZWN0aW9uOiB0cnVlLCAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gUHJldmVudCBhY2NpZGVudGFsIGRlbGV0ZSB2aWEgY29uc29sZVxuICAgICAgZW5hYmxlUGVyZm9ybWFuY2VJbnNpZ2h0czogdHJ1ZSwgICAgICAgICAgICAgICAgICAgLy8gRlJFRSBvbiB0My5sYXJnZSDigJQgNy1kYXkgcXVlcnkgYW5hbHlzaXNcbiAgICAgIG1vbml0b3JpbmdJbnRlcnZhbDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLCAgICAgIC8vIEVuaGFuY2VkIE1vbml0b3Jpbmcg4oCUIE9TLWxldmVsIG1ldHJpY3MgZXZlcnkgNjBzICh+JDAuNTAvbW8pXG4gICAgICAvLyBOT1RFOiBzdG9yYWdlRW5jcnlwdGVkIGNhbm5vdCBiZSBlbmFibGVkIG9uIGFuIGV4aXN0aW5nIHVuZW5jcnlwdGVkIGluc3RhbmNlLlxuICAgICAgLy8gSXQgcmVxdWlyZXMgYSByZXBsYWNlIChzbmFwc2hvdCArIHJlc3RvcmUpLiBTa2lwcGluZyB0byBhdm9pZCBkYXRhIGxvc3Mgcmlzay5cbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIDYuIFJEUyBQcm94eSDigJQgUkVNT1ZFRCAoc2F2ZXMgJDIyL21vbnRoKVxuICAgIC8vICAgIFdpdGggZGIudDMubGFyZ2UgKDg1NSBtYXggY29ubmVjdGlvbnMpIGFuZCBMYW1iZGEgcG9vbCBtYXg9MSBwZXJcbiAgICAvLyAgICBpbnN0YW5jZSwgcmVzZXJ2ZWQgY29uY3VycmVuY3kgMjAwIOKGkiBtYXggMjAwIERCIGNvbm5lY3Rpb25zIHRvdGFsLlxuICAgIC8vICAgIDIwMCA8PCA4NTUsIHNvIHRoZSBwcm94eSBpcyByZWR1bmRhbnQgYW5kIGNvc3RzIG1vbmV5IGZvciBub3RoaW5nLlxuICAgIC8vICAgIExhbWJkYSBub3cgY29ubmVjdHMgZGlyZWN0bHkgdG8gdGhlIFJEUyBpbnN0YW5jZSBlbmRwb2ludC5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIDcuIFByZSBTaWduLVVwIExhbWJkYSBUcmlnZ2VyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgY29uc3QgcHJlU2lnblVwTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQ29nbml0b1ByZVNpZ25VcFRyaWdnZXInLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVycy9jb2duaXRvLXByZS1zaWdudXAuaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvZGlzdCcpKSxcbiAgICAgIHZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHsgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtsYW1iZGFTZ10sXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBEQl9IT1NUOiBkYkluc3RhbmNlLmRiSW5zdGFuY2VFbmRwb2ludEFkZHJlc3MsICAvLyBEaXJlY3QgUkRTIOKAlCBwcm94eSByZW1vdmVkXG4gICAgICAgIERCX1BPUlQ6ICc1NDMyJyxcbiAgICAgICAgREJfTkFNRTogJ2Fkdml0aXlhbnMnLFxuICAgICAgICBEQl9VU0VSOiAncG9zdGdyZXMnLFxuICAgICAgICBEQl9TRUNSRVRfQVJOOiBkYlNlY3JldC5zZWNyZXRBcm4sXG4gICAgICAgIERCX1NTTDogJ3RydWUnLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBkYlNlY3JldC5ncmFudFJlYWQocHJlU2lnblVwTGFtYmRhKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIDguIENvZ25pdG8gVXNlciBQb29sXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgY29uc3QgdXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnQWR2aXRpeWFuc1VzZXJQb29sJywge1xuICAgICAgdXNlclBvb2xOYW1lOiAnYWR2aXRpeWFucy11c2VyLXBvb2wnLFxuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXG4gICAgICBzaWduSW5BbGlhc2VzOiB7IGVtYWlsOiB0cnVlIH0sXG4gICAgICBhdXRvVmVyaWZ5OiB7IGVtYWlsOiB0cnVlIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IDgsXG4gICAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IGZhbHNlLFxuICAgICAgICByZXF1aXJlRGlnaXRzOiB0cnVlLFxuICAgICAgICByZXF1aXJlU3ltYm9sczogZmFsc2UsXG4gICAgICB9LFxuICAgICAgY3VzdG9tQXR0cmlidXRlczoge1xuICAgICAgICByb2xlOiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoeyBtdXRhYmxlOiB0cnVlIH0pLFxuICAgICAgICByZWdfbm86IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7IG11dGFibGU6IHRydWUgfSksXG4gICAgICAgIHllYXI6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7IG11dGFibGU6IHRydWUgfSksXG4gICAgICB9LFxuICAgICAgLy8g4pSA4pSAIFBhc3N3b3JkIFJlc2V0IE9UUCBFbWFpbCBUZW1wbGF0ZSDilIDilIBcbiAgICAgIHVzZXJWZXJpZmljYXRpb246IHtcbiAgICAgICAgZW1haWxTdWJqZWN0OiAnT1RQIGZvciBSR00gTWFuYWdlQkFDIOKAkyBZb3VyIE9uZS1UaW1lIFBhc3N3b3JkJyxcbiAgICAgICAgZW1haWxCb2R5OlxuICAgICAgICAgICdEZWFyIEZhY3VsdHksXFxuXFxuJyArXG4gICAgICAgICAgJ1lvdSByZXF1ZXN0ZWQgYSBwYXNzd29yZCByZXNldCBmb3IgeW91ciBSR00gTWFuYWdlQkFDIGFjY291bnQgKHt1c2VybmFtZX0pLlxcblxcbicgK1xuICAgICAgICAgICdZb3VyIE9uZS1UaW1lIFBhc3N3b3JkIChPVFApIGlzOlxcblxcbicgK1xuICAgICAgICAgICd7IyMjI31cXG5cXG4nICtcbiAgICAgICAgICAnVGhpcyBPVFAgaXMgdmFsaWQgZm9yIDEgaG91ci4gRG8gbm90IHNoYXJlIGl0IHdpdGggYW55b25lLlxcblxcbicgK1xuICAgICAgICAgICdJZiB5b3UgZGlkIG5vdCByZXF1ZXN0IHRoaXMsIHBsZWFzZSBpZ25vcmUgdGhpcyBlbWFpbC5cXG5cXG4nICtcbiAgICAgICAgICAnUmVnYXJkcyxcXG5SR00gTWFuYWdlQkFDIFN5c3RlbVxcblJHTSBDb2xsZWdlIG9mIEVuZ2luZWVyaW5nICYgVGVjaG5vbG9neScsXG4gICAgICAgIGVtYWlsU3R5bGU6IGNvZ25pdG8uVmVyaWZpY2F0aW9uRW1haWxTdHlsZS5DT0RFLFxuICAgICAgfSxcbiAgICAgIGxhbWJkYVRyaWdnZXJzOiB7XG4gICAgICAgIHByZVNpZ25VcDogcHJlU2lnblVwTGFtYmRhLFxuICAgICAgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICBjb25zdCB1c2VyUG9vbENsaWVudCA9IG5ldyBjb2duaXRvLlVzZXJQb29sQ2xpZW50KHRoaXMsICdBZHZpdGl5YW5zVXNlclBvb2xDbGllbnQnLCB7XG4gICAgICB1c2VyUG9vbCxcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogJ2Fkdml0aXlhbnMtd2ViLWNsaWVudCcsXG4gICAgICBnZW5lcmF0ZVNlY3JldDogZmFsc2UsXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcbiAgICAgICAgY3VzdG9tOiB0cnVlLFxuICAgICAgICBhZG1pblVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyA5LiBTMyBVcGxvYWRzIEJ1Y2tldCAoY3JlYXRlZCBiZWZvcmUgTGFtYmRhIHNvIGVudiB2YXIgY2FuIHJlZmVyZW5jZSBpdClcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBjb25zdCB1cGxvYWRzQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnQWR2aXRpeWFuc1VwbG9hZHNCdWNrZXQnLCB7XG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW3MzLkh0dHBNZXRob2RzLkdFVCwgczMuSHR0cE1ldGhvZHMuUFVULCBzMy5IdHRwTWV0aG9kcy5QT1NUXSxcbiAgICAgICAgICBhbGxvd2VkT3JpZ2luczogWycqJ10sXG4gICAgICAgICAgYWxsb3dlZEhlYWRlcnM6IFsnKiddLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIDEwLiBCYWNrZW5kIEFQSSBMYW1iZGEgRnVuY3Rpb24gKGluIFZQQywgY29ubmVjdHMgdmlhIFJEUyBQcm94eSlcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBITUFDIGtleSBmb3Igc2VydmVyLXNpZ25lZCBzZXNzaW9uIHRva2VucyAoYWRtaW4vSE9EL292ZXJzaWdodC9wYXJlbnQvREItcGFzc3dvcmQgbG9naW5zKS5cbiAgICAvLyBHZW5lcmF0ZWQgb25jZSBieSBTZWNyZXRzIE1hbmFnZXI7IG5ldmVyIHN0b3JlZCBpbiB0aGUgcmVwbyBvciBpbiBHaXRIdWIgU2VjcmV0cy5cbiAgICBjb25zdCBzZXNzaW9uU2lnbmluZ1NlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0Fkdml0aXlhbnNTZXNzaW9uU2lnbmluZ1NlY3JldCcsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnSE1BQyBrZXkgZm9yIEFkdml0aXlhbnMgc2VydmVyLXNpZ25lZCBzZXNzaW9uIHRva2VucycsXG4gICAgICBnZW5lcmF0ZVNlY3JldFN0cmluZzogeyBwYXNzd29yZExlbmd0aDogNjQsIGV4Y2x1ZGVQdW5jdHVhdGlvbjogdHJ1ZSB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYXBpTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQWR2aXRpeWFuc0FwaUhhbmRsZXInLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVycy9hcGkuaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvZGlzdCcpKSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDkwMCksICAgICAgIC8vIE1heCAxNSBtaW5zIGZvciBFdmVudEJyaWRnZSBDcm9uLiBBUEkgR2F0ZXdheSB3aWxsIHN0aWxsIGRyb3AgYXQgMjlzLlxuICAgICAgbWVtb3J5U2l6ZTogNTEyLCAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gMsOXIENQVSBzcGVlZCB2cyAyNTYgTUI7IHJ1bnMgfjM1JSBmYXN0ZXJcbiAgICAgIC8vIE5PVEU6IHJlc2VydmVkQ29uY3VycmVudEV4ZWN1dGlvbnMgcmVtb3ZlZCDigJQgYWNjb3VudCBsaW1pdCBpcyBvbmx5IDEwIHRvdGFsIGNvbmN1cnJlbnRcbiAgICAgIC8vIGV4ZWN1dGlvbnMuIFdpdGggdDMubGFyZ2UgKDg1NSBtYXggREIgY29ubmVjdGlvbnMpIGFuZCBvbmx5IDEwIG1heCBMYW1iZGEgZXhlY3V0aW9ucyxcbiAgICAgIC8vIGNvbm5lY3Rpb24gZXhoYXVzdGlvbiBpcyBpbXBvc3NpYmxlLiBObyByZXNlcnZhdGlvbiBuZWVkZWQuXG4gICAgICB2cGMsXG4gICAgICB2cGNTdWJuZXRzOiB7IHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbbGFtYmRhU2ddLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgREJfSE9TVDogZGJJbnN0YW5jZS5kYkluc3RhbmNlRW5kcG9pbnRBZGRyZXNzLCAgLy8gRGlyZWN0IFJEUyDigJQgcHJveHkgcmVtb3ZlZFxuICAgICAgICBEQl9QT1JUOiAnNTQzMicsXG4gICAgICAgIERCX05BTUU6ICdhZHZpdGl5YW5zJyxcbiAgICAgICAgREJfVVNFUjogJ3Bvc3RncmVzJyxcbiAgICAgICAgREJfU0VDUkVUX0FSTjogZGJTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgICBEQl9TU0w6ICd0cnVlJyxcbiAgICAgICAgQ09HTklUT19VU0VSX1BPT0xfSUQ6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICAgIENPR05JVE9fQ0xJRU5UX0lEOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgICBVUExPQURTX0JVQ0tFVF9OQU1FOiB1cGxvYWRzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIFVTRV9NT0NLOiAnZmFsc2UnLFxuICAgICAgICAvLyBBZG1pbi9IT0QgY3JlZGVudGlhbHMg4oCUIHNvdXJjZWQgZnJvbSBHaXRIdWIgU2VjcmV0cywgbmV2ZXIgaGFyZGNvZGVkIGluIGZyb250ZW5kXG4gICAgICAgIEFETUlOX01BU1RFUl9FTUFJTDogcHJvY2Vzcy5lbnYuQURNSU5fTUFTVEVSX0VNQUlMIHx8ICdhZG1pbkByZ21jZXQuZWR1LmluJyxcbiAgICAgICAgQURNSU5fTUFTVEVSX1BBU1M6IHByb2Nlc3MuZW52LkFETUlOX01BU1RFUl9QQVNTIHx8ICcnLFxuICAgICAgICBIT0RfTUFTVEVSX0VNQUlMOiBwcm9jZXNzLmVudi5IT0RfTUFTVEVSX0VNQUlMIHx8ICdob2Rjc2Vkc0ByZ21jZXQuZWR1LmluJyxcbiAgICAgICAgSE9EX01BU1RFUl9QQVNTOiBwcm9jZXNzLmVudi5IT0RfTUFTVEVSX1BBU1MgfHwgJycsXG4gICAgICAgIC8vIFNlY3JldCBmb3IgcHJvdGVjdGluZyAvZGItaW5pdCBhbmQgL2RiLW1pZ3JhdGUgZW5kcG9pbnRzXG4gICAgICAgIEFETUlOX1NFQ1JFVDogcHJvY2Vzcy5lbnYuQURNSU5fU0VDUkVUIHx8ICcnLFxuICAgICAgICAvLyBGYWN1bHR5IHJlZ2lzdHJhdGlvbiBzZWN1cml0eSBrZXkg4oCUIHJlcXVpcmVkIGZvciBmYWN1bHR5L0hPRCBzZWxmLXJlZ2lzdHJhdGlvblxuICAgICAgICBGQUNVTFRZX1NFQ1JFVF9LRVk6IHByb2Nlc3MuZW52LkZBQ1VMVFlfU0VDUkVUX0tFWSB8fCAnJyxcbiAgICAgICAgR0lUSFVCX1BBVDogcHJvY2Vzcy5lbnYuR0lUSFVCX1BBVCB8fCAnJyxcbiAgICAgICAgLy8gUmVzb2x2ZWQgYnkgQ2xvdWRGb3JtYXRpb24gYXQgZGVwbG95IHRpbWUgKGR5bmFtaWMgcmVmZXJlbmNlKSDigJQgdmFsdWUgbmV2ZXIgYXBwZWFycyBpbiB0aGUgdGVtcGxhdGVcbiAgICAgICAgU0VTU0lPTl9TSUdOSU5HX1NFQ1JFVDogc2Vzc2lvblNpZ25pbmdTZWNyZXQuc2VjcmV0VmFsdWUudW5zYWZlVW53cmFwKCksXG4gICAgICAgIC8vIE5vdGlmaWNhdGlvbnM6IHB1YmxpYyBoYWx2ZXMgb25seSDigJQgdGhlIG5vdGlmaWVyIExhbWJkYSBob2xkcyB0aGUgcHJpdmF0ZSBrZXlzIC8gYm90IHRva2VuXG4gICAgICAgIFZBUElEX1BVQkxJQ19LRVk6IHByb2Nlc3MuZW52LlZBUElEX1BVQkxJQ19LRVkgfHwgJycsXG4gICAgICAgIFRFTEVHUkFNX0JPVF9VU0VSTkFNRTogcHJvY2Vzcy5lbnYuVEVMRUdSQU1fQk9UX1VTRVJOQU1FIHx8ICcnLFxuICAgICAgICBCVUlMRF9USU1FU1RBTVA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgZGJTZWNyZXQuZ3JhbnRSZWFkKGFwaUxhbWJkYSk7XG4gICAgdXBsb2Fkc0J1Y2tldC5ncmFudFJlYWRXcml0ZShhcGlMYW1iZGEpO1xuICAgIC8vIE5PVEU6IHJkc1Byb3h5LmdyYW50Q29ubmVjdCByZW1vdmVkIOKAlCBwcm94eSBkZWxldGVkLiBMYW1iZGEgdXNlcyBwYXNzd29yZCBhdXRoIHZpYSBTZWNyZXRzIE1hbmFnZXIuXG5cbiAgICAvLyBHcmFudCBMYW1iZGEgcGVybWlzc2lvbiB0byBkZWxldGUgYW5kIG1hbmFnZSB1c2VycyBpbiBDb2duaXRvIFVzZXIgUG9vbFxuICAgIGFwaUxhbWJkYS5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnY29nbml0by1pZHA6QWRtaW5EZWxldGVVc2VyJyxcbiAgICAgICAgJ2NvZ25pdG8taWRwOkFkbWluR2V0VXNlcicsXG4gICAgICAgICdjb2duaXRvLWlkcDpBZG1pbkRpc2FibGVVc2VyJyxcbiAgICAgICAgJ2NvZ25pdG8taWRwOkxpc3RVc2VycycsXG4gICAgICAgIC8vIFJlcXVpcmVkIGZvciBzZXJ2ZXItc2lkZSBzaWduLWluIChQT1NUIC9hdXRoL2NvZ25pdG8tc2lnbmluKVxuICAgICAgICAnY29nbml0by1pZHA6QWRtaW5Jbml0aWF0ZUF1dGgnLFxuICAgICAgICAvLyBSZXF1aXJlZCBmb3IgcGFzc3dvcmQgc3luYyBhbmQgYWNjb3VudCBoZWFsaW5nXG4gICAgICAgICdjb2duaXRvLWlkcDpBZG1pblNldFVzZXJQYXNzd29yZCcsXG4gICAgICAgIC8vIFJlcXVpcmVkIGZvciBjcmVhdGluZyBDb2duaXRvIGFjY291bnRzIGZvciBEQi1vbmx5IHN0dWRlbnRzXG4gICAgICAgICdjb2duaXRvLWlkcDpBZG1pbkNyZWF0ZVVzZXInLFxuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW3VzZXJQb29sLnVzZXJQb29sQXJuXSxcbiAgICB9KSk7XG5cbiAgICAvLyBOaWdodGx5IENyb24gSm9iICgxMjowMCBBTSBJU1QgPSAxODozMCBVVEMpIGZvciBBdXRvLVN5bmNcbiAgICBjb25zdCBuaWdodGx5U3luY1J1bGUgPSBuZXcgZXZlbnRzLlJ1bGUodGhpcywgJ05pZ2h0bHlDb2RpbmdQcm9maWxlU3luYycsIHtcbiAgICAgIHNjaGVkdWxlOiBldmVudHMuU2NoZWR1bGUuY3Jvbih7IG1pbnV0ZTogJzMwJywgaG91cjogJzE4JywgbW9udGg6ICcqJywgd2Vla0RheTogJyonLCB5ZWFyOiAnKicgfSksXG4gICAgICBkZXNjcmlwdGlvbjogJ1RyaWdnZXJzIHRoZSBBUEkgTGFtYmRhIGV2ZXJ5IG5pZ2h0IGF0IDEyIEFNIElTVCB0byBiYXRjaCBzeW5jIHN0YWxlIExlZXRDb2RlIGFuZCBHaXRIdWIgY29kaW5nIHByb2ZpbGVzLicsXG4gICAgfSk7XG4gICAgbmlnaHRseVN5bmNSdWxlLmFkZFRhcmdldChuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbihhcGlMYW1iZGEpKTtcblxuICAgIC8vIEtlZXAtd2FybTogcGluZyB0aGUgQVBJIExhbWJkYSBldmVyeSA1IG1pbnV0ZXMgc28gdGhlIGZpcnN0IGxvZ2luIGFmdGVyIGEgcXVpZXQgc3BlbGxcbiAgICAvLyBkb2Vzbid0IHBheSB0aGUgY29sZC1zdGFydCBjb3N0IChidW5kbGUgbG9hZCArIFNlY3JldHMgTWFuYWdlciArIERCIFRMUyBoYW5kc2hha2UpLlxuICAgIGNvbnN0IGtlZXBXYXJtUnVsZSA9IG5ldyBldmVudHMuUnVsZSh0aGlzLCAnQXBpS2VlcFdhcm0nLCB7XG4gICAgICBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLnJhdGUoY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSkpLFxuICAgICAgZGVzY3JpcHRpb246ICdLZWVwcyBvbmUgQVBJIExhbWJkYSBpbnN0YW5jZSBhbmQgaXRzIERCIGNvbm5lY3Rpb24gd2FybS4nLFxuICAgIH0pO1xuICAgIGtlZXBXYXJtUnVsZS5hZGRUYXJnZXQobmV3IHRhcmdldHMuTGFtYmRhRnVuY3Rpb24oYXBpTGFtYmRhLCB7XG4gICAgICBldmVudDogZXZlbnRzLlJ1bGVUYXJnZXRJbnB1dC5mcm9tT2JqZWN0KHsgd2FybXVwOiB0cnVlIH0pLFxuICAgIH0pKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIDExLiBBUEkgR2F0ZXdheSBSRVNUIEFQSVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNvbnN0IGFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgJ0Fkdml0aXlhbnNSZXN0QXBpJywge1xuICAgICAgcmVzdEFwaU5hbWU6ICdBZHZpdGl5YW5zIFBsYWNlbWVudCBSZWFkaW5lc3MgQVBJJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIGZvciBBZHZpdGl5YW5zIFN0dWRlbnQgMzYwIHBsYXRmb3JtIChkaXJlY3QgUkRTIGNvbm5lY3Rpb24pJyxcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgdGhyb3R0bGluZ0J1cnN0TGltaXQ6IDEwMDAsICAgICAvLyBBYnNvcmJzIGJ1cnN0IG9mIHVwIHRvIDEwMDAgc2ltdWx0YW5lb3VzIHN0dWRlbnQgbG9naW5zXG4gICAgICAgIHRocm90dGxpbmdSYXRlTGltaXQ6IDMwMCwgICAgICAgLy8gU3VzdGFpbmVkIDMwMCByZXF1ZXN0cy9zZWNvbmQg4oCUIHdlbGwgYWJvdmUgbm9ybWFsIHVzYWdlXG4gICAgICAgIG1ldHJpY3NFbmFibGVkOiB0cnVlLCAgICAgICAgICAgLy8gRW5hYmxlcyBmcmVlIENsb3VkV2F0Y2ggbWV0cmljcyBkYXNoYm9hcmRcbiAgICAgIH0sXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBhcGlnYXRld2F5LkNvcnMuQUxMX09SSUdJTlMsXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IGFwaWdhdGV3YXkuQ29ycy5ERUZBVUxUX0hFQURFUlMuY29uY2F0KFsneC1hZG1pbi1zZWNyZXQnLCAnY2FsbGVyX2VtYWlsJywgJ3gtY2FsbGVyLWVtYWlsJywgJ1gtUmVxdWVzdGVkLVdpdGgnXSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgYXBpLmFkZEdhdGV3YXlSZXNwb25zZSgnRGVmYXVsdDRYWCcsIHtcbiAgICAgIHR5cGU6IGFwaWdhdGV3YXkuUmVzcG9uc2VUeXBlLkRFRkFVTFRfNFhYLFxuICAgICAgcmVzcG9uc2VIZWFkZXJzOiB7XG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiBcIicqJ1wiLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6IFwiJyonXCIsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogXCInKidcIixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBhcGkuYWRkR2F0ZXdheVJlc3BvbnNlKCdEZWZhdWx0NVhYJywge1xuICAgICAgdHlwZTogYXBpZ2F0ZXdheS5SZXNwb25zZVR5cGUuREVGQVVMVF81WFgsXG4gICAgICByZXNwb25zZUhlYWRlcnM6IHtcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IFwiJyonXCIsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogXCInKidcIixcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiBcIicqJ1wiLFxuICAgICAgfSxcbiAgICB9KTtcblxuXG4gICAgY29uc3QgbGFtYmRhSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihhcGlMYW1iZGEpO1xuXG4gICAgLy8gUm9vdCBHRVQgLyBtZXRob2Qg4oCUIHNlcnZlcyB0aGUgZnJvbnRlbmQgaW5kZXguaHRtbCBvdmVyIEhUVFBTXG4gICAgYXBpLnJvb3QuYWRkTWV0aG9kKCdHRVQnLCBsYW1iZGFJbnRlZ3JhdGlvbiwge1xuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuTk9ORSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHByb3h5UmVzb3VyY2UgPSBhcGkucm9vdC5hZGRQcm94eSh7XG4gICAgICBkZWZhdWx0SW50ZWdyYXRpb246IGxhbWJkYUludGVncmF0aW9uLFxuICAgICAgZGVmYXVsdE1ldGhvZE9wdGlvbnM6IHtcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuTk9ORSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBVbmF1dGhlbnRpY2F0ZWQgcHVibGljIHJvdXRlIGZvciBoZWFsdGggJiBhdmFpbGFiaWxpdHkgY2hlY2tcbiAgICBjb25zdCBhdXRoUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnYXV0aCcpO1xuICAgIGNvbnN0IGNoZWNrQXZhaWxhYmlsaXR5UmVzb3VyY2UgPSBhdXRoUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2NoZWNrLWF2YWlsYWJpbGl0eScpO1xuICAgIGNoZWNrQXZhaWxhYmlsaXR5UmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBsYW1iZGFJbnRlZ3JhdGlvbiwge1xuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuTk9ORSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGhlYWx0aFJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2hlYWx0aCcpO1xuICAgIGhlYWx0aFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbGFtYmRhSW50ZWdyYXRpb24sIHtcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLk5PTkUsXG4gICAgfSk7XG5cbiAgICBjb25zdCBkYkluaXRSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdkYi1pbml0Jyk7XG4gICAgZGJJbml0UmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBsYW1iZGFJbnRlZ3JhdGlvbiwge1xuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuTk9ORSxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIDEyLiBTMyBGcm9udGVuZCBIb3N0aW5nIEJ1Y2tldCAoV2Vic2l0ZSBIb3N0aW5nKVxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNvbnN0IGZyb250ZW5kQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnQWR2aXRpeWFuc0Zyb250ZW5kQnVja2V0Jywge1xuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgICAgcHVibGljUmVhZEFjY2VzczogdHJ1ZSxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBuZXcgczMuQmxvY2tQdWJsaWNBY2Nlc3Moe1xuICAgICAgICBibG9ja1B1YmxpY0FjbHM6IGZhbHNlLFxuICAgICAgICBibG9ja1B1YmxpY1BvbGljeTogZmFsc2UsXG4gICAgICAgIGlnbm9yZVB1YmxpY0FjbHM6IGZhbHNlLFxuICAgICAgICByZXN0cmljdFB1YmxpY0J1Y2tldHM6IGZhbHNlLFxuICAgICAgfSksXG4gICAgICB3ZWJzaXRlSW5kZXhEb2N1bWVudDogJ2luZGV4Lmh0bWwnLFxuICAgICAgd2Vic2l0ZUVycm9yRG9jdW1lbnQ6ICdpbmRleC5odG1sJyxcbiAgICAgIGNvcnM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBbJyonXSxcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW3MzLkh0dHBNZXRob2RzLkdFVCwgczMuSHR0cE1ldGhvZHMuSEVBRF0sXG4gICAgICAgICAgYWxsb3dlZEhlYWRlcnM6IFsnKiddLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIDEzLiBDbG91ZEZyb250IERpc3RyaWJ1dGlvbiBmb3IgSFRUUFMgJiBDRE4gQWNjZWxlcmF0aW9uXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgY29uc3QgY2ZEaXN0cmlidXRpb24gPSBuZXcgY2xvdWRmcm9udC5EaXN0cmlidXRpb24odGhpcywgJ0Fkdml0aXlhbnNDbG91ZEZyb250Jywge1xuICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XG4gICAgICAgIG9yaWdpbjogbmV3IG9yaWdpbnMuUzNTdGF0aWNXZWJzaXRlT3JpZ2luKGZyb250ZW5kQnVja2V0KSxcbiAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXG4gICAgICB9LFxuICAgICAgZGVmYXVsdFJvb3RPYmplY3Q6ICdpbmRleC5odG1sJyxcbiAgICAgIGVycm9yUmVzcG9uc2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBodHRwU3RhdHVzOiA0MDQsXG4gICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiAyMDAsXG4gICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyxcbiAgICAgICAgICB0dGw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDApLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgaHR0cFN0YXR1czogNDAzLFxuICAgICAgICAgIHJlc3BvbnNlSHR0cFN0YXR1czogMjAwLFxuICAgICAgICAgIHJlc3BvbnNlUGFnZVBhdGg6ICcvaW5kZXguaHRtbCcsXG4gICAgICAgICAgdHRsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygwKSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyBTdGFjayBPdXRwdXRzXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gMTQuIE5vdGlmaWVyIExhbWJkYSAob3V0c2lkZSB0aGUgVlBDIOKAlCBoYXMgaW50ZXJuZXQsIG5vIE5BVCBuZWVkZWQpXG4gICAgLy8gICAgIEFQSSBMYW1iZGEg4oaSIFMzIG5vdGlmeS9vdXRib3gvKi5qc29uIChmcmVlIGdhdGV3YXkgZW5kcG9pbnQpIOKGkiB0aGlzIExhbWJkYSDihpIgVGVsZWdyYW0gLyBXZWIgUHVzaC5cbiAgICAvLyAgICAgSXRzIEZ1bmN0aW9uIFVSTCBpcyB0aGUgVGVsZWdyYW0gd2ViaG9vayAodmVyaWZpZWQgd2l0aCBhIHNlY3JldCBoZWFkZXIpLlxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNvbnN0IG5vdGlmaWVyTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQWR2aXRpeWFuc05vdGlmaWVyJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcnMvbm90aWZpZXIuaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvZGlzdCcpKSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwKSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIE5PVElGWV9CVUNLRVQ6IHVwbG9hZHNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgQVBQX1VSTDogYGh0dHBzOi8vJHtjZkRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfWAsXG4gICAgICAgIFRFTEVHUkFNX0JPVF9UT0tFTjogcHJvY2Vzcy5lbnYuVEVMRUdSQU1fQk9UX1RPS0VOIHx8ICcnLFxuICAgICAgICBWQVBJRF9QVUJMSUNfS0VZOiBwcm9jZXNzLmVudi5WQVBJRF9QVUJMSUNfS0VZIHx8ICcnLFxuICAgICAgICBWQVBJRF9QUklWQVRFX0tFWTogcHJvY2Vzcy5lbnYuVkFQSURfUFJJVkFURV9LRVkgfHwgJycsXG4gICAgICAgIFZBUElEX1NVQkpFQ1Q6ICdtYWlsdG86YWRtaW5AcmdtY2V0LmVkdS5pbicsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIHVwbG9hZHNCdWNrZXQuZ3JhbnRSZWFkV3JpdGUobm90aWZpZXJMYW1iZGEsICdub3RpZnkvKicpO1xuICAgIHVwbG9hZHNCdWNrZXQuYWRkRXZlbnROb3RpZmljYXRpb24oczMuRXZlbnRUeXBlLk9CSkVDVF9DUkVBVEVELCBuZXcgczNuLkxhbWJkYURlc3RpbmF0aW9uKG5vdGlmaWVyTGFtYmRhKSwgeyBwcmVmaXg6ICdub3RpZnkvb3V0Ym94LycgfSk7XG4gICAgY29uc3Qgbm90aWZpZXJVcmwgPSBub3RpZmllckxhbWJkYS5hZGRGdW5jdGlvblVybCh7IGF1dGhUeXBlOiBsYW1iZGEuRnVuY3Rpb25VcmxBdXRoVHlwZS5OT05FIH0pO1xuXG4gICAgLy8gRGFpbHkgNjowMCBQTSBJU1Q6IGFic2VuY2UgYWxlcnRzIHRvIHN1YnNjcmliZWQgcGFyZW50cyAvIHN0dWRlbnRzLCB0b21vcnJvdydzIGNsdWIgc2Vzc2lvbnNcbiAgICBjb25zdCBkYWlseU5vdGlmeVJ1bGUgPSBuZXcgZXZlbnRzLlJ1bGUodGhpcywgJ0RhaWx5Tm90aWZpY2F0aW9ucycsIHtcbiAgICAgIHNjaGVkdWxlOiBldmVudHMuU2NoZWR1bGUuY3Jvbih7IG1pbnV0ZTogJzMwJywgaG91cjogJzEyJywgbW9udGg6ICcqJywgd2Vla0RheTogJyonLCB5ZWFyOiAnKicgfSksXG4gICAgICBkZXNjcmlwdGlvbjogJ1F1ZXVlcyBkYWlseSBhYnNlbmNlIGFsZXJ0cyBhbmQgY2x1YiBzZXNzaW9uIHJlbWluZGVycyAoNiBQTSBJU1QpLicsXG4gICAgfSk7XG4gICAgZGFpbHlOb3RpZnlSdWxlLmFkZFRhcmdldChuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbihhcGlMYW1iZGEsIHtcbiAgICAgIGV2ZW50OiBldmVudHMuUnVsZVRhcmdldElucHV0LmZyb21PYmplY3QoeyBqb2I6ICdkYWlseS1ub3RpZnknIH0pLFxuICAgIH0pKTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdOb3RpZmllclVybCcsIHsgdmFsdWU6IG5vdGlmaWVyVXJsLnVybCB9KTtcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpR2F0ZXdheVVybCcsIHsgdmFsdWU6IGFwaS51cmwgfSk7XG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sSWQnLCB7IHZhbHVlOiB1c2VyUG9vbC51c2VyUG9vbElkIH0pO1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbENsaWVudElkJywgeyB2YWx1ZTogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCB9KTtcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRnJvbnRlbmRXZWJzaXRlVXJsJywgeyB2YWx1ZTogZnJvbnRlbmRCdWNrZXQuYnVja2V0V2Vic2l0ZVVybCB9KTtcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ2xvdWRGcm9udFVybCcsIHsgdmFsdWU6IGBodHRwczovLyR7Y2ZEaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX1gIH0pO1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDbG91ZEZyb250RGlzdHJpYnV0aW9uSWQnLCB7IHZhbHVlOiBjZkRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25JZCB9KTtcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRnJvbnRlbmRCdWNrZXROYW1lJywgeyB2YWx1ZTogZnJvbnRlbmRCdWNrZXQuYnVja2V0TmFtZSB9KTtcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXBsb2Fkc0J1Y2tldE5hbWUnLCB7IHZhbHVlOiB1cGxvYWRzQnVja2V0LmJ1Y2tldE5hbWUgfSk7XG4gICAgLy8gUmRzUHJveHlFbmRwb2ludCBvdXRwdXQgcmVtb3ZlZCDigJQgcHJveHkgZGVsZXRlZCB0byBzYXZlICQyMi9tb250aFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdSZHNFbmRwb2ludCcsIHsgdmFsdWU6IGRiSW5zdGFuY2UuZGJJbnN0YW5jZUVuZHBvaW50QWRkcmVzcyB9KTtcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGJTZWNyZXRBcm4nLCB7IHZhbHVlOiBkYlNlY3JldC5zZWNyZXRBcm4gfSk7XG4gIH1cbn1cbiJdfQ==