import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

export class AdvitiyansStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
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
      removalPolicy: cdk.RemovalPolicy.RETAIN,          // Protect data from accidental cdk destroy
      autoMinorVersionUpgrade: true,
      publiclyAccessible: false,
      backupRetention: cdk.Duration.days(7),             // Daily automated snapshots (free)
      deletionProtection: true,                          // Prevent accidental delete via console
      enablePerformanceInsights: true,                   // FREE on t3.large — 7-day query analysis
      storageEncrypted: true,                            // Encrypt data at rest (security best practice)
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
        DB_HOST: dbInstance.dbInstanceEndpointAddress,  // Direct RDS — proxy removed
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
      timeout: cdk.Duration.seconds(29),       // API Gateway hard max; handles heavy HOD report queries
      memorySize: 512,                          // 2× CPU speed vs 256 MB; runs ~35% faster
      reservedConcurrentExecutions: 200,        // Cap = 200 × max:1 pool = 200 DB connections (safe under 855)
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [lambdaSg],
      environment: {
        DB_HOST: dbInstance.dbInstanceEndpointAddress,  // Direct RDS — proxy removed
        DB_PORT: '5432',
        DB_NAME: 'advitiyans',
        DB_USER: 'postgres',
        DB_SECRET_ARN: dbSecret.secretArn,
        DB_SSL: 'true',
        COGNITO_USER_POOL_ID: userPool.userPoolId,
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
      ],
      resources: [userPool.userPoolArn],
    }));

    // ========================================================================
    // 11. API Gateway REST API
    // ========================================================================
    const api = new apigateway.RestApi(this, 'AdvitiyansRestApi', {
      restApiName: 'Advitiyans Placement Readiness API',
      description: 'API for Advitiyans Student 360 platform (direct RDS connection)',
      deployOptions: {
        throttlingBurstLimit: 1000,     // Absorbs burst of up to 1000 simultaneous student logins
        throttlingRateLimit: 300,       // Sustained 300 requests/second — well above normal usage
        metricsEnabled: true,           // Enables free CloudWatch metrics dashboard
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
