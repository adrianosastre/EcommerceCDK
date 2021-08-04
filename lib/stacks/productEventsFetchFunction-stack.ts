import * as cdk from "@aws-cdk/core";
import * as lambda from "@aws-cdk/aws-lambda";
import * as lambdaNodeJS from "@aws-cdk/aws-lambda-nodejs";
import * as dynamodb from "@aws-cdk/aws-dynamodb";

export class ProductEventsFetchFunctionStack extends cdk.Stack {
  readonly handler: lambdaNodeJS.NodejsFunction;

  constructor(
    scope: cdk.Construct,
    id: string,
    eventsDdb: dynamodb.Table,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    this.handler = new lambdaNodeJS.NodejsFunction(this, "ProductEventsFetchFunction", {
      functionName: "ProductEventsFetchFunction",
      entry: "lambda/productEventsFetchFunction.js",
      handler: "handler",
      bundling: {
        minify: false,
        sourceMap: true,
      },
      tracing: lambda.Tracing.ACTIVE,
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      environment: {
        EVENTS_DDB: eventsDdb.tableName,
      },
    });

    eventsDdb.grantReadData(this.handler);
    // para realmente dar acesso somente a itens começando por #product
    // https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/specifying-conditions.html
    // this.handler.addToRolePolicy(new policy)
  }
}