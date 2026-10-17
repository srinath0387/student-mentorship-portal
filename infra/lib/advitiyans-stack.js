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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWR2aXRpeWFucy1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFkdml0aXlhbnMtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBRW5DLDJDQUEyQztBQUMzQywyQ0FBMkM7QUFDM0MsaUVBQWlFO0FBQ2pFLG1EQUFtRDtBQUNuRCxpREFBaUQ7QUFDakQseURBQXlEO0FBQ3pELHlDQUF5QztBQUN6Qyx5REFBeUQ7QUFDekQsOERBQThEO0FBQzlELDJDQUEyQztBQUMzQyxpREFBaUQ7QUFDakQsMERBQTBEO0FBQzFELDZCQUE2QjtBQUU3QixNQUFhLGVBQWdCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDNUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUM5RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QiwyRUFBMkU7UUFDM0UsU0FBUztRQUNULDJFQUEyRTtRQUMzRSxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUM3QyxNQUFNLEVBQUUsQ0FBQztZQUNULFdBQVcsRUFBRSxDQUFDLEVBQUUsK0NBQStDO1lBQy9ELG1CQUFtQixFQUFFO2dCQUNuQjtvQkFDRSxRQUFRLEVBQUUsRUFBRTtvQkFDWixJQUFJLEVBQUUsUUFBUTtvQkFDZCxVQUFVLEVBQUUsR0FBRyxDQUFDLFVBQVUsQ0FBQyxNQUFNO2lCQUNsQztnQkFDRDtvQkFDRSxRQUFRLEVBQUUsRUFBRTtvQkFDWixJQUFJLEVBQUUsVUFBVTtvQkFDaEIsVUFBVSxFQUFFLEdBQUcsQ0FBQyxVQUFVLENBQUMsZ0JBQWdCO2lCQUM1QzthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsaURBQWlEO1FBQ2pELEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxZQUFZLEVBQUU7WUFDbkMsT0FBTyxFQUFFLEdBQUcsQ0FBQyw0QkFBNEIsQ0FB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d3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIHJkcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtcmRzJztcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlcic7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQnO1xuaW1wb3J0ICogYXMgb3JpZ2lucyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udC1vcmlnaW5zJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzJztcbmltcG9ydCAqIGFzIHRhcmdldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cy10YXJnZXRzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cbmV4cG9ydCBjbGFzcyBBZHZpdGl5YW5zU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyAxLiBWUENcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBjb25zdCB2cGMgPSBuZXcgZWMyLlZwYyh0aGlzLCAnQWR2aXRpeWFuc1ZwYycsIHtcbiAgICAgIG1heEF6czogMixcbiAgICAgIG5hdEdhdGV3YXlzOiAwLCAvLyBDb3N0IG9wdGltaXplZDogYXZvaWQgTmF0R2F0ZXdheSBob3VybHkgY29zdFxuICAgICAgc3VibmV0Q29uZmlndXJhdGlvbjogW1xuICAgICAgICB7XG4gICAgICAgICAgY2lkck1hc2s6IDI0LFxuICAgICAgICAgIG5hbWU6ICdQdWJsaWMnLFxuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBVQkxJQyxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGNpZHJNYXNrOiAyNCxcbiAgICAgICAgICBuYW1lOiAnSXNvbGF0ZWQnLFxuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gR2F0ZXdheSBFbmRwb2ludHMgZm9yIFMzIChmcmVlLCBubyBOQVQgbmVlZGVkKVxuICAgIHZwYy5hZGRHYXRld2F5RW5kcG9pbnQoJ1MzRW5kcG9pbnQnLCB7XG4gICAgICBzZXJ2aWNlOiBlYzIuR2F0ZXdheVZwY0VuZHBvaW50QXdzU2VydmljZS5TMyxcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIDIuIFNlY3VyaXR5IEdyb3Vwc1xuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gTGFtYmRhIFNlY3VyaXR5IEdyb3VwXG4gICAgY29uc3QgbGFtYmRhU2cgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0xhbWJkYVNlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBMYW1iZGEgZnVuY3Rpb25zJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgLy8gUkRTIEluc3RhbmNlIFNlY3VyaXR5IEdyb3VwXG4gICAgY29uc3QgZGJTZyA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnUmRzU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIFJEUyBQb3N0Z3JlU1FMIGluc3RhbmNlJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgLy8gVlBDIEVuZHBvaW50IFNlY3VyaXR5IEdyb3VwXG4gICAgY29uc3QgdnBjZVNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ1ZwY2VTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgVlBDIEludGVyZmFjZSBFbmRwb2ludHMnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2UsXG4gICAgfSk7XG5cbiAgICAvLyAtLS0gU2VjdXJpdHkgR3JvdXAgUnVsZXMgLS0tXG4gICAgLy8gTGFtYmRhIOKGkiBSRFMgZGlyZWN0bHkgKHBvcnQgNTQzMikg4oCUIG5vIHByb3h5XG4gICAgbGFtYmRhU2cuYWRkRWdyZXNzUnVsZShkYlNnLCBlYzIuUG9ydC50Y3AoNTQzMiksICdMYW1iZGEgZGlyZWN0IHRvIFJEUycpO1xuICAgIGRiU2cuYWRkSW5ncmVzc1J1bGUobGFtYmRhU2csIGVjMi5Qb3J0LnRjcCg1NDMyKSwgJ0FsbG93IExhbWJkYSBkaXJlY3QgdG8gUkRTJyk7XG5cbiAgICAvLyBMYW1iZGEg4oaSIFZQQyBFbmRwb2ludHMgKHBvcnQgNDQzIGZvciBTZWNyZXRzIE1hbmFnZXIpXG4gICAgbGFtYmRhU2cuYWRkRWdyZXNzUnVsZSh2cGNlU2VjdXJpdHlHcm91cCwgZWMyLlBvcnQudGNwKDQ0MyksICdMYW1iZGEgdG8gVlBDIEVuZHBvaW50cycpO1xuICAgIHZwY2VTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKGxhbWJkYVNnLCBlYzIuUG9ydC50Y3AoNDQzKSwgJ0FsbG93IExhbWJkYSB0byBWUEMgRW5kcG9pbnRzJyk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyAzLiBWUEMgSW50ZXJmYWNlIEVuZHBvaW50c1xuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gU2VjcmV0cyBNYW5hZ2VyIGVuZHBvaW50IOKAlCBuZWVkZWQgYnkgTGFtYmRhIHRvIGZldGNoIERCIGNyZWRlbnRpYWxzXG4gICAgdnBjLmFkZEludGVyZmFjZUVuZHBvaW50KCdTZWNyZXRzTWFuYWdlckVuZHBvaW50Jywge1xuICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5TRUNSRVRTX01BTkFHRVIsXG4gICAgICBzdWJuZXRzOiB7IHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbdnBjZVNlY3VyaXR5R3JvdXBdLFxuICAgICAgcHJpdmF0ZURuc0VuYWJsZWQ6IHRydWUsXG4gICAgfSk7XG4gICAgLy8gTk9URTogU1RTIGVuZHBvaW50IHJlbW92ZWQg4oCUIHdhcyBvbmx5IG5lZWRlZCBmb3IgUkRTIFByb3h5IElBTSBhdXRoIChwcm94eSByZW1vdmVkKS5cblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIC8vIDQuIERhdGFiYXNlIFNlY3JldHMgTWFuYWdlclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNvbnN0IGRiU2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnQWR2aXRpeWFuc0RiU2VjcmV0Jywge1xuICAgICAgc2VjcmV0TmFtZTogJ2Fkdml0aXlhbnMtZGItY3JlZGVudGlhbHMnLFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6IEpTT04uc3RyaW5naWZ5KHsgdXNlcm5hbWU6ICdwb3N0Z3JlcycgfSksXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAncGFzc3dvcmQnLFxuICAgICAgICBleGNsdWRlUHVuY3R1YXRpb246IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gNS4gUkRTIFBvc3RncmVTUUwgSW5zdGFuY2UgKGRiLnQzLmxhcmdlLCBTaW5nbGUtQVopXG4gICAgLy8gICAgVXBncmFkZWQgZnJvbSB0NGcubWljcm86IDEgR0IgUkFNIC8gODcgY29ubmVjdGlvbnMg4oaSIDggR0IgUkFNIC8gODU1IGNvbm5lY3Rpb25zXG4gICAgLy8gICAgU3VwcG9ydHMgMTAsMDAwIHN0dWRlbnRzIHdpdGhvdXQgY29ubmVjdGlvbiBleGhhdXN0aW9uLlxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNvbnN0IGRiSW5zdGFuY2UgPSBuZXcgcmRzLkRhdGFiYXNlSW5zdGFuY2UodGhpcywgJ0Fkdml0aXlhbnNSRFMnLCB7XG4gICAgICBlbmdpbmU6IHJkcy5EYXRhYmFzZUluc3RhbmNlRW5naW5lLnBvc3RncmVzKHtcbiAgICAgICAgdmVyc2lvbjogcmRzLlBvc3RncmVzRW5naW5lVmVyc2lvbi5WRVJfMTUsXG4gICAgICB9KSxcbiAgICAgIGluc3RhbmNlVHlwZTogZWMyLkluc3RhbmNlVHlwZS5vZihlYzIuSW5zdGFuY2VDbGFzcy5UMywgZWMyLkluc3RhbmNlU2l6ZS5MQVJHRSksXG4gICAgICB2cGMsXG4gICAgICB2cGNTdWJuZXRzOiB7IHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbZGJTZ10sXG4gICAgICBhbGxvY2F0ZWRTdG9yYWdlOiAzMCxcbiAgICAgIG1heEFsbG9jYXRlZFN0b3JhZ2U6IDEwMCxcbiAgICAgIGNyZWRlbnRpYWxzOiByZHMuQ3JlZGVudGlhbHMuZnJvbVNlY3JldChkYlNlY3JldCksXG4gICAgICBkYXRhYmFzZU5hbWU6ICdhZHZpdGl5YW5zJyxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiwgICAgICAgICAgLy8gUHJvdGVjdCBkYXRhIGZyb20gYWNjaWRlbnRhbCBjZGsgZGVzdHJveVxuICAgICAgYXV0b01pbm9yVmVyc2lvblVwZ3JhZGU6IHRydWUsXG4gICAgICBwdWJsaWNseUFjY2Vzc2libGU6IGZhbHNlLFxuICAgICAgYmFja3VwUmV0ZW50aW9uOiBjZGsuRHVyYXRpb24uZGF5cyg3KSwgICAgICAgICAgICAgLy8gRGFpbHkgYXV0b21hdGVkIHNuYXBzaG90cyAoZnJlZSlcbiAgICAgIGRlbGV0aW9uUHJvdGVjdGlvbjogdHJ1ZSwgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFByZXZlbnQgYWNjaWRlbnRhbCBkZWxldGUgdmlhIGNvbnNvbGVcbiAgICAgIGVuYWJsZVBlcmZvcm1hbmNlSW5zaWdodHM6IHRydWUsICAgICAgICAgICAgICAgICAgIC8vIEZSRUUgb24gdDMubGFyZ2Ug4oCUIDctZGF5IHF1ZXJ5IGFuYWx5c2lzXG4gICAgICBtb25pdG9yaW5nSW50ZXJ2YWw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwKSwgICAgICAvLyBFbmhhbmNlZCBNb25pdG9yaW5nIOKAlCBPUy1sZXZlbCBtZXRyaWNzIGV2ZXJ5IDYwcyAofiQwLjUwL21vKVxuICAgICAgLy8gTk9URTogc3RvcmFnZUVuY3J5cHRlZCBjYW5ub3QgYmUgZW5hYmxlZCBvbiBhbiBleGlzdGluZyB1bmVuY3J5cHRlZCBpbnN0YW5jZS5cbiAgICAgIC8vIEl0IHJlcXVpcmVzIGEgcmVwbGFjZSAoc25hcHNob3QgKyByZXN0b3JlKS4gU2tpcHBpbmcgdG8gYXZvaWQgZGF0YSBsb3NzIHJpc2suXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyA2LiBSRFMgUHJveHkg4oCUIFJFTU9WRUQgKHNhdmVzICQyMi9tb250aClcbiAgICAvLyAgICBXaXRoIGRiLnQzLmxhcmdlICg4NTUgbWF4IGNvbm5lY3Rpb25zKSBhbmQgTGFtYmRhIHBvb2wgbWF4PTEgcGVyXG4gICAgLy8gICAgaW5zdGFuY2UsIHJlc2VydmVkIGNvbmN1cnJlbmN5IDIwMCDihpIgbWF4IDIwMCBEQiBjb25uZWN0aW9ucyB0b3RhbC5cbiAgICAvLyAgICAyMDAgPDwgODU1LCBzbyB0aGUgcHJveHkgaXMgcmVkdW5kYW50IGFuZCBjb3N0cyBtb25leSBmb3Igbm90aGluZy5cbiAgICAvLyAgICBMYW1iZGEgbm93IGNvbm5lY3RzIGRpcmVjdGx5IHRvIHRoZSBSRFMgaW5zdGFuY2UgZW5kcG9pbnQuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyA3LiBQcmUgU2lnbi1VcCBMYW1iZGEgVHJpZ2dlclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNvbnN0IHByZVNpZ25VcExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0NvZ25pdG9QcmVTaWduVXBUcmlnZ2VyJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcnMvY29nbml0by1wcmUtc2lnbnVwLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL2Rpc3QnKSksXG4gICAgICB2cGMsXG4gICAgICB2cGNTdWJuZXRzOiB7IHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbbGFtYmRhU2ddLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgREJfSE9TVDogZGJJbnN0YW5jZS5kYkluc3RhbmNlRW5kcG9pbnRBZGRyZXNzLCAgLy8gRGlyZWN0IFJEUyDigJQgcHJveHkgcmVtb3ZlZFxuICAgICAgICBEQl9QT1JUOiAnNTQzMicsXG4gICAgICAgIERCX05BTUU6ICdhZHZpdGl5YW5zJyxcbiAgICAgICAgREJfVVNFUjogJ3Bvc3RncmVzJyxcbiAgICAgICAgREJfU0VDUkVUX0FSTjogZGJTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgICBEQl9TU0w6ICd0cnVlJyxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgZGJTZWNyZXQuZ3JhbnRSZWFkKHByZVNpZ25VcExhbWJkYSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyA4LiBDb2duaXRvIFVzZXIgUG9vbFxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNvbnN0IHVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgJ0Fkdml0aXlhbnNVc2VyUG9vbCcsIHtcbiAgICAgIHVzZXJQb29sTmFtZTogJ2Fkdml0aXlhbnMtdXNlci1wb29sJyxcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxuICAgICAgc2lnbkluQWxpYXNlczogeyBlbWFpbDogdHJ1ZSB9LFxuICAgICAgYXV0b1ZlcmlmeTogeyBlbWFpbDogdHJ1ZSB9LFxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcbiAgICAgICAgbWluTGVuZ3RoOiA4LFxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiBmYWxzZSxcbiAgICAgICAgcmVxdWlyZURpZ2l0czogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIGN1c3RvbUF0dHJpYnV0ZXM6IHtcbiAgICAgICAgcm9sZTogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcbiAgICAgICAgcmVnX25vOiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoeyBtdXRhYmxlOiB0cnVlIH0pLFxuICAgICAgICB5ZWFyOiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoeyBtdXRhYmxlOiB0cnVlIH0pLFxuICAgICAgfSxcbiAgICAgIC8vIOKUgOKUgCBQYXNzd29yZCBSZXNldCBPVFAgRW1haWwgVGVtcGxhdGUg4pSA4pSAXG4gICAgICB1c2VyVmVyaWZpY2F0aW9uOiB7XG4gICAgICAgIGVtYWlsU3ViamVjdDogJ09UUCBmb3IgUkdNIE1hbmFnZUJBQyDigJMgWW91ciBPbmUtVGltZSBQYXNzd29yZCcsXG4gICAgICAgIGVtYWlsQm9keTpcbiAgICAgICAgICAnRGVhciBGYWN1bHR5LFxcblxcbicgK1xuICAgICAgICAgICdZb3UgcmVxdWVzdGVkIGEgcGFzc3dvcmQgcmVzZXQgZm9yIHlvdXIgUkdNIE1hbmFnZUJBQyBhY2NvdW50ICh7dXNlcm5hbWV9KS5cXG5cXG4nICtcbiAgICAgICAgICAnWW91ciBPbmUtVGltZSBQYXNzd29yZCAoT1RQKSBpczpcXG5cXG4nICtcbiAgICAgICAgICAneyMjIyN9XFxuXFxuJyArXG4gICAgICAgICAgJ1RoaXMgT1RQIGlzIHZhbGlkIGZvciAxIGhvdXIuIERvIG5vdCBzaGFyZSBpdCB3aXRoIGFueW9uZS5cXG5cXG4nICtcbiAgICAgICAgICAnSWYgeW91IGRpZCBub3QgcmVxdWVzdCB0aGlzLCBwbGVhc2UgaWdub3JlIHRoaXMgZW1haWwuXFxuXFxuJyArXG4gICAgICAgICAgJ1JlZ2FyZHMsXFxuUkdNIE1hbmFnZUJBQyBTeXN0ZW1cXG5SR00gQ29sbGVnZSBvZiBFbmdpbmVlcmluZyAmIFRlY2hub2xvZ3knLFxuICAgICAgICBlbWFpbFN0eWxlOiBjb2duaXRvLlZlcmlmaWNhdGlvbkVtYWlsU3R5bGUuQ09ERSxcbiAgICAgIH0sXG4gICAgICBsYW1iZGFUcmlnZ2Vyczoge1xuICAgICAgICBwcmVTaWduVXA6IHByZVNpZ25VcExhbWJkYSxcbiAgICAgIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdXNlclBvb2xDbGllbnQgPSBuZXcgY29nbml0by5Vc2VyUG9vbENsaWVudCh0aGlzLCAnQWR2aXRpeWFuc1VzZXJQb29sQ2xpZW50Jywge1xuICAgICAgdXNlclBvb2wsXG4gICAgICB1c2VyUG9vbENsaWVudE5hbWU6ICdhZHZpdGl5YW5zLXdlYi1jbGllbnQnLFxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLFxuICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgIHVzZXJTcnA6IHRydWUsXG4gICAgICAgIGN1c3RvbTogdHJ1ZSxcbiAgICAgICAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gOS4gUzMgVXBsb2FkcyBCdWNrZXQgKGNyZWF0ZWQgYmVmb3JlIExhbWJkYSBzbyBlbnYgdmFyIGNhbiByZWZlcmVuY2UgaXQpXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgY29uc3QgdXBsb2Fkc0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0Fkdml0aXlhbnNVcGxvYWRzQnVja2V0Jywge1xuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgICAgY29yczogW1xuICAgICAgICB7XG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtzMy5IdHRwTWV0aG9kcy5HRVQsIHMzLkh0dHBNZXRob2RzLlBVVCwgczMuSHR0cE1ldGhvZHMuUE9TVF0sXG4gICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IFsnKiddLFxuICAgICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbJyonXSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyAxMC4gQmFja2VuZCBBUEkgTGFtYmRhIEZ1bmN0aW9uIChpbiBWUEMsIGNvbm5lY3RzIHZpYSBSRFMgUHJveHkpXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgY29uc3QgYXBpTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQWR2aXRpeWFuc0FwaUhhbmRsZXInLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVycy9hcGkuaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvZGlzdCcpKSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDkwMCksICAgICAgIC8vIE1heCAxNSBtaW5zIGZvciBFdmVudEJyaWRnZSBDcm9uLiBBUEkgR2F0ZXdheSB3aWxsIHN0aWxsIGRyb3AgYXQgMjlzLlxuICAgICAgbWVtb3J5U2l6ZTogNTEyLCAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gMsOXIENQVSBzcGVlZCB2cyAyNTYgTUI7IHJ1bnMgfjM1JSBmYXN0ZXJcbiAgICAgIC8vIE5PVEU6IHJlc2VydmVkQ29uY3VycmVudEV4ZWN1dGlvbnMgcmVtb3ZlZCDigJQgYWNjb3VudCBsaW1pdCBpcyBvbmx5IDEwIHRvdGFsIGNvbmN1cnJlbnRcbiAgICAgIC8vIGV4ZWN1dGlvbnMuIFdpdGggdDMubGFyZ2UgKDg1NSBtYXggREIgY29ubmVjdGlvbnMpIGFuZCBvbmx5IDEwIG1heCBMYW1iZGEgZXhlY3V0aW9ucyxcbiAgICAgIC8vIGNvbm5lY3Rpb24gZXhoYXVzdGlvbiBpcyBpbXBvc3NpYmxlLiBObyByZXNlcnZhdGlvbiBuZWVkZWQuXG4gICAgICB2cGMsXG4gICAgICB2cGNTdWJuZXRzOiB7IHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfSVNPTEFURUQgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbbGFtYmRhU2ddLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgREJfSE9TVDogZGJJbnN0YW5jZS5kYkluc3RhbmNlRW5kcG9pbnRBZGRyZXNzLCAgLy8gRGlyZWN0IFJEUyDigJQgcHJveHkgcmVtb3ZlZFxuICAgICAgICBEQl9QT1JUOiAnNTQzMicsXG4gICAgICAgIERCX05BTUU6ICdhZHZpdGl5YW5zJyxcbiAgICAgICAgREJfVVNFUjogJ3Bvc3RncmVzJyxcbiAgICAgICAgREJfU0VDUkVUX0FSTjogZGJTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgICBEQl9TU0w6ICd0cnVlJyxcbiAgICAgICAgQ09HTklUT19VU0VSX1BPT0xfSUQ6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICAgIENPR05JVE9fQ0xJRU5UX0lEOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgICBVUExPQURTX0JVQ0tFVF9OQU1FOiB1cGxvYWRzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIFVTRV9NT0NLOiAnZmFsc2UnLFxuICAgICAgICAvLyBBZG1pbi9IT0QgY3JlZGVudGlhbHMg4oCUIHNvdXJjZWQgZnJvbSBHaXRIdWIgU2VjcmV0cywgbmV2ZXIgaGFyZGNvZGVkIGluIGZyb250ZW5kXG4gICAgICAgIEFETUlOX01BU1RFUl9FTUFJTDogcHJvY2Vzcy5lbnYuQURNSU5fTUFTVEVSX0VNQUlMIHx8ICdhZG1pbkByZ21jZXQuZWR1LmluJyxcbiAgICAgICAgQURNSU5fTUFTVEVSX1BBU1M6IHByb2Nlc3MuZW52LkFETUlOX01BU1RFUl9QQVNTIHx8ICcnLFxuICAgICAgICBIT0RfTUFTVEVSX0VNQUlMOiBwcm9jZXNzLmVudi5IT0RfTUFTVEVSX0VNQUlMIHx8ICdob2Rjc2Vkc0ByZ21jZXQuZWR1LmluJyxcbiAgICAgICAgSE9EX01BU1RFUl9QQVNTOiBwcm9jZXNzLmVudi5IT0RfTUFTVEVSX1BBU1MgfHwgJycsXG4gICAgICAgIC8vIFNlY3JldCBmb3IgcHJvdGVjdGluZyAvZGItaW5pdCBhbmQgL2RiLW1pZ3JhdGUgZW5kcG9pbnRzXG4gICAgICAgIEFETUlOX1NFQ1JFVDogcHJvY2Vzcy5lbnYuQURNSU5fU0VDUkVUIHx8ICcnLFxuICAgICAgICAvLyBGYWN1bHR5IHJlZ2lzdHJhdGlvbiBzZWN1cml0eSBrZXkg4oCUIHJlcXVpcmVkIGZvciBmYWN1bHR5L0hPRCBzZWxmLXJlZ2lzdHJhdGlvblxuICAgICAgICBGQUNVTFRZX1NFQ1JFVF9LRVk6IHByb2Nlc3MuZW52LkZBQ1VMVFlfU0VDUkVUX0tFWSB8fCAnJyxcbiAgICAgICAgR0lUSFVCX1BBVDogcHJvY2Vzcy5lbnYuR0lUSFVCX1BBVCB8fCAnJyxcbiAgICAgICAgQlVJTERfVElNRVNUQU1QOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICB9LFxuICAgIH0pO1xuICAgIGRiU2VjcmV0LmdyYW50UmVhZChhcGlMYW1iZGEpO1xuICAgIHVwbG9hZHNCdWNrZXQuZ3JhbnRSZWFkV3JpdGUoYXBpTGFtYmRhKTtcbiAgICAvLyBOT1RFOiByZHNQcm94eS5ncmFudENvbm5lY3QgcmVtb3ZlZCDigJQgcHJveHkgZGVsZXRlZC4gTGFtYmRhIHVzZXMgcGFzc3dvcmQgYXV0aCB2aWEgU2VjcmV0cyBNYW5hZ2VyLlxuXG4gICAgLy8gR3JhbnQgTGFtYmRhIHBlcm1pc3Npb24gdG8gZGVsZXRlIGFuZCBtYW5hZ2UgdXNlcnMgaW4gQ29nbml0byBVc2VyIFBvb2xcbiAgICBhcGlMYW1iZGEuYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2NvZ25pdG8taWRwOkFkbWluRGVsZXRlVXNlcicsXG4gICAgICAgICdjb2duaXRvLWlkcDpBZG1pbkdldFVzZXInLFxuICAgICAgICAnY29nbml0by1pZHA6QWRtaW5EaXNhYmxlVXNlcicsXG4gICAgICAgICdjb2duaXRvLWlkcDpMaXN0VXNlcnMnLFxuICAgICAgICAvLyBSZXF1aXJlZCBmb3Igc2VydmVyLXNpZGUgc2lnbi1pbiAoUE9TVCAvYXV0aC9jb2duaXRvLXNpZ25pbilcbiAgICAgICAgJ2NvZ25pdG8taWRwOkFkbWluSW5pdGlhdGVBdXRoJyxcbiAgICAgICAgLy8gUmVxdWlyZWQgZm9yIHBhc3N3b3JkIHN5bmMgYW5kIGFjY291bnQgaGVhbGluZ1xuICAgICAgICAnY29nbml0by1pZHA6QWRtaW5TZXRVc2VyUGFzc3dvcmQnLFxuICAgICAgICAvLyBSZXF1aXJlZCBmb3IgY3JlYXRpbmcgQ29nbml0byBhY2NvdW50cyBmb3IgREItb25seSBzdHVkZW50c1xuICAgICAgICAnY29nbml0by1pZHA6QWRtaW5DcmVhdGVVc2VyJyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFt1c2VyUG9vbC51c2VyUG9vbEFybl0sXG4gICAgfSkpO1xuXG4gICAgLy8gTmlnaHRseSBDcm9uIEpvYiAoMTI6MDAgQU0gSVNUID0gMTg6MzAgVVRDKSBmb3IgQXV0by1TeW5jXG4gICAgY29uc3QgbmlnaHRseVN5bmNSdWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdOaWdodGx5Q29kaW5nUHJvZmlsZVN5bmMnLCB7XG4gICAgICBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLmNyb24oeyBtaW51dGU6ICczMCcsIGhvdXI6ICcxOCcsIG1vbnRoOiAnKicsIHdlZWtEYXk6ICcqJywgeWVhcjogJyonIH0pLFxuICAgICAgZGVzY3JpcHRpb246ICdUcmlnZ2VycyB0aGUgQVBJIExhbWJkYSBldmVyeSBuaWdodCBhdCAxMiBBTSBJU1QgdG8gYmF0Y2ggc3luYyBzdGFsZSBMZWV0Q29kZSBhbmQgR2l0SHViIGNvZGluZyBwcm9maWxlcy4nLFxuICAgIH0pO1xuICAgIG5pZ2h0bHlTeW5jUnVsZS5hZGRUYXJnZXQobmV3IHRhcmdldHMuTGFtYmRhRnVuY3Rpb24oYXBpTGFtYmRhKSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyAxMS4gQVBJIEdhdGV3YXkgUkVTVCBBUElcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBjb25zdCBhcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdBZHZpdGl5YW5zUmVzdEFwaScsIHtcbiAgICAgIHJlc3RBcGlOYW1lOiAnQWR2aXRpeWFucyBQbGFjZW1lbnQgUmVhZGluZXNzIEFQSScsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBmb3IgQWR2aXRpeWFucyBTdHVkZW50IDM2MCBwbGF0Zm9ybSAoZGlyZWN0IFJEUyBjb25uZWN0aW9uKScsXG4gICAgICBkZXBsb3lPcHRpb25zOiB7XG4gICAgICAgIHRocm90dGxpbmdCdXJzdExpbWl0OiAxMDAwLCAgICAgLy8gQWJzb3JicyBidXJzdCBvZiB1cCB0byAxMDAwIHNpbXVsdGFuZW91cyBzdHVkZW50IGxvZ2luc1xuICAgICAgICB0aHJvdHRsaW5nUmF0ZUxpbWl0OiAzMDAsICAgICAgIC8vIFN1c3RhaW5lZCAzMDAgcmVxdWVzdHMvc2Vjb25kIOKAlCB3ZWxsIGFib3ZlIG5vcm1hbCB1c2FnZVxuICAgICAgICBtZXRyaWNzRW5hYmxlZDogdHJ1ZSwgICAgICAgICAgIC8vIEVuYWJsZXMgZnJlZSBDbG91ZFdhdGNoIG1ldHJpY3MgZGFzaGJvYXJkXG4gICAgICB9LFxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgIGFsbG93T3JpZ2luczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLFxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWdhdGV3YXkuQ29ycy5BTExfTUVUSE9EUyxcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBhcGlnYXRld2F5LkNvcnMuREVGQVVMVF9IRUFERVJTLmNvbmNhdChbJ3gtYWRtaW4tc2VjcmV0JywgJ2NhbGxlcl9lbWFpbCcsICd4LWNhbGxlci1lbWFpbCcsICdYLVJlcXVlc3RlZC1XaXRoJ10pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGFwaS5hZGRHYXRld2F5UmVzcG9uc2UoJ0RlZmF1bHQ0WFgnLCB7XG4gICAgICB0eXBlOiBhcGlnYXRld2F5LlJlc3BvbnNlVHlwZS5ERUZBVUxUXzRYWCxcbiAgICAgIHJlc3BvbnNlSGVhZGVyczoge1xuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogXCInKidcIixcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiBcIicqJ1wiLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6IFwiJyonXCIsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgYXBpLmFkZEdhdGV3YXlSZXNwb25zZSgnRGVmYXVsdDVYWCcsIHtcbiAgICAgIHR5cGU6IGFwaWdhdGV3YXkuUmVzcG9uc2VUeXBlLkRFRkFVTFRfNVhYLFxuICAgICAgcmVzcG9uc2VIZWFkZXJzOiB7XG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiBcIicqJ1wiLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6IFwiJyonXCIsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogXCInKidcIixcbiAgICAgIH0sXG4gICAgfSk7XG5cblxuICAgIGNvbnN0IGxhbWJkYUludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYXBpTGFtYmRhKTtcblxuICAgIC8vIFJvb3QgR0VUIC8gbWV0aG9kIOKAlCBzZXJ2ZXMgdGhlIGZyb250ZW5kIGluZGV4Lmh0bWwgb3ZlciBIVFRQU1xuICAgIGFwaS5yb290LmFkZE1ldGhvZCgnR0VUJywgbGFtYmRhSW50ZWdyYXRpb24sIHtcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLk5PTkUsXG4gICAgfSk7XG5cbiAgICBjb25zdCBwcm94eVJlc291cmNlID0gYXBpLnJvb3QuYWRkUHJveHkoe1xuICAgICAgZGVmYXVsdEludGVncmF0aW9uOiBsYW1iZGFJbnRlZ3JhdGlvbixcbiAgICAgIGRlZmF1bHRNZXRob2RPcHRpb25zOiB7XG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLk5PTkUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gVW5hdXRoZW50aWNhdGVkIHB1YmxpYyByb3V0ZSBmb3IgaGVhbHRoICYgYXZhaWxhYmlsaXR5IGNoZWNrXG4gICAgY29uc3QgYXV0aFJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2F1dGgnKTtcbiAgICBjb25zdCBjaGVja0F2YWlsYWJpbGl0eVJlc291cmNlID0gYXV0aFJlc291cmNlLmFkZFJlc291cmNlKCdjaGVjay1hdmFpbGFiaWxpdHknKTtcbiAgICBjaGVja0F2YWlsYWJpbGl0eVJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbGFtYmRhSW50ZWdyYXRpb24sIHtcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLk5PTkUsXG4gICAgfSk7XG5cbiAgICBjb25zdCBoZWFsdGhSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdoZWFsdGgnKTtcbiAgICBoZWFsdGhSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGxhbWJkYUludGVncmF0aW9uLCB7XG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5OT05FLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZGJJbml0UmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnZGItaW5pdCcpO1xuICAgIGRiSW5pdFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbGFtYmRhSW50ZWdyYXRpb24sIHtcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLk5PTkUsXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyAxMi4gUzMgRnJvbnRlbmQgSG9zdGluZyBCdWNrZXQgKFdlYnNpdGUgSG9zdGluZylcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBjb25zdCBmcm9udGVuZEJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0Fkdml0aXlhbnNGcm9udGVuZEJ1Y2tldCcsIHtcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgIHB1YmxpY1JlYWRBY2Nlc3M6IHRydWUsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogbmV3IHMzLkJsb2NrUHVibGljQWNjZXNzKHtcbiAgICAgICAgYmxvY2tQdWJsaWNBY2xzOiBmYWxzZSxcbiAgICAgICAgYmxvY2tQdWJsaWNQb2xpY3k6IGZhbHNlLFxuICAgICAgICBpZ25vcmVQdWJsaWNBY2xzOiBmYWxzZSxcbiAgICAgICAgcmVzdHJpY3RQdWJsaWNCdWNrZXRzOiBmYWxzZSxcbiAgICAgIH0pLFxuICAgICAgd2Vic2l0ZUluZGV4RG9jdW1lbnQ6ICdpbmRleC5odG1sJyxcbiAgICAgIHdlYnNpdGVFcnJvckRvY3VtZW50OiAnaW5kZXguaHRtbCcsXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkT3JpZ2luczogWycqJ10sXG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtzMy5IdHRwTWV0aG9kcy5HRVQsIHMzLkh0dHBNZXRob2RzLkhFQURdLFxuICAgICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbJyonXSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAvLyAxMy4gQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gZm9yIEhUVFBTICYgQ0ROIEFjY2VsZXJhdGlvblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNvbnN0IGNmRGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsICdBZHZpdGl5YW5zQ2xvdWRGcm9udCcsIHtcbiAgICAgIGRlZmF1bHRCZWhhdmlvcjoge1xuICAgICAgICBvcmlnaW46IG5ldyBvcmlnaW5zLlMzU3RhdGljV2Vic2l0ZU9yaWdpbihmcm9udGVuZEJ1Y2tldCksXG4gICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LlJFRElSRUNUX1RPX0hUVFBTLFxuICAgICAgfSxcbiAgICAgIGRlZmF1bHRSb290T2JqZWN0OiAnaW5kZXguaHRtbCcsXG4gICAgICBlcnJvclJlc3BvbnNlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaHR0cFN0YXR1czogNDA0LFxuICAgICAgICAgIHJlc3BvbnNlSHR0cFN0YXR1czogMjAwLFxuICAgICAgICAgIHJlc3BvbnNlUGFnZVBhdGg6ICcvaW5kZXguaHRtbCcsXG4gICAgICAgICAgdHRsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygwKSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGh0dHBTdGF0dXM6IDQwMyxcbiAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcbiAgICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiAnL2luZGV4Lmh0bWwnLFxuICAgICAgICAgIHR0bDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMCksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgLy8gU3RhY2sgT3V0cHV0c1xuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlHYXRld2F5VXJsJywgeyB2YWx1ZTogYXBpLnVybCB9KTtcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xJZCcsIHsgdmFsdWU6IHVzZXJQb29sLnVzZXJQb29sSWQgfSk7XG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sQ2xpZW50SWQnLCB7IHZhbHVlOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkIH0pO1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdGcm9udGVuZFdlYnNpdGVVcmwnLCB7IHZhbHVlOiBmcm9udGVuZEJ1Y2tldC5idWNrZXRXZWJzaXRlVXJsIH0pO1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDbG91ZEZyb250VXJsJywgeyB2YWx1ZTogYGh0dHBzOi8vJHtjZkRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfWAgfSk7XG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Nsb3VkRnJvbnREaXN0cmlidXRpb25JZCcsIHsgdmFsdWU6IGNmRGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbklkIH0pO1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdGcm9udGVuZEJ1Y2tldE5hbWUnLCB7IHZhbHVlOiBmcm9udGVuZEJ1Y2tldC5idWNrZXROYW1lIH0pO1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVcGxvYWRzQnVja2V0TmFtZScsIHsgdmFsdWU6IHVwbG9hZHNCdWNrZXQuYnVja2V0TmFtZSB9KTtcbiAgICAvLyBSZHNQcm94eUVuZHBvaW50IG91dHB1dCByZW1vdmVkIOKAlCBwcm94eSBkZWxldGVkIHRvIHNhdmUgJDIyL21vbnRoXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Jkc0VuZHBvaW50JywgeyB2YWx1ZTogZGJJbnN0YW5jZS5kYkluc3RhbmNlRW5kcG9pbnRBZGRyZXNzIH0pO1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEYlNlY3JldEFybicsIHsgdmFsdWU6IGRiU2VjcmV0LnNlY3JldEFybiB9KTtcbiAgfVxufVxuIl19