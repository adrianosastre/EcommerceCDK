import * as cdk from "@aws-cdk/core";
import * as lambda from "@aws-cdk/aws-lambda";
import * as lambdaNodeJS from "@aws-cdk/aws-lambda-nodejs";
import * as dynamodb from "@aws-cdk/aws-dynamodb";

export class OrdersApplicationStack extends cdk.Stack {
  readonly ordersHandler: lambdaNodeJS.NodejsFunction;

  constructor(
    scope: cdk.Construct,
    id: string,
    productsDdb: dynamodb.Table,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    const ordersDdb = new dynamodb.Table(this, "OrdersDdb", {
      tableName: "OrdersDdb",
      partitionKey: {
        name: "pk",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "sk",
        type: dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      //readCapacity: 1,
      //writeCapacity: 1,
    });

    /*const readScale = ordersDdb.autoScaleReadCapacity({
      maxCapacity: 4,
      minCapacity: 1,
    });
    readScale.scaleOnUtilization({
      targetUtilizationPercent: 50, // porcentagem que triga o upscale
      scaleInCooldown: cdk.Duration.seconds(30), // tempo de espera entre 1 upscale e o seguinte
      scaleOutCooldown: cdk.Duration.seconds(30), // tempo de espera entre 1 downscale e o seguinte
    });

    const writeScale = ordersDdb.autoScaleWriteCapacity({
      maxCapacity: 4,
      minCapacity: 1,
    });
    writeScale.scaleOnUtilization({
      targetUtilizationPercent: 50, // porcentagem que triga o upscale
      scaleInCooldown: cdk.Duration.seconds(30), // tempo de espera entre 1 upscale e o seguinte
      scaleOutCooldown: cdk.Duration.seconds(30), // tempo de espera entre 1 downscale e o seguinte
    });*/

   this.ordersHandler = new lambdaNodeJS.NodejsFunction(this, "OrdersFunction", {
      functionName: "OrdersFunction",
      entry: "lambda/ordersFunction.js",
      handler: "handler",
      bundling: {
        minify: false,
        sourceMap: true,
      },
      tracing: lambda.Tracing.ACTIVE,
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      environment: {
        PRODUCTS_DDB: productsDdb.tableName,
        ORDERS_DDB: ordersDdb.tableName,
      },
    });
    productsDdb.grantReadData(this.ordersHandler);
    ordersDdb.grantReadWriteData(this.ordersHandler);
  }
}