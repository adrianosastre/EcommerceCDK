import * as cdk from "@aws-cdk/core";
import * as dynamodb from "@aws-cdk/aws-dynamodb";

export class ProductsDdbStack extends cdk.Stack {
  readonly table: dynamodb.Table;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.table = new dynamodb.Table(this, "ProductsDdb", {
      tableName: "ProductsDdb",
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      //readCapacity: 1,
      //writeCapacity: 1,
    });

    /*const readScale = this.table.autoScaleReadCapacity({
      maxCapacity: 10,
      minCapacity: 1,
    });
    readScale.scaleOnUtilization({
      targetUtilizationPercent: 50, // porcentagem que triga o upscale
      scaleInCooldown: cdk.Duration.seconds(30), // tempo de espera entre 1 upscale e o seguinte
      scaleOutCooldown: cdk.Duration.seconds(30), // tempo de espera entre 1 downscale e o seguinte
    });

    const writeScale = this.table.autoScaleWriteCapacity({
      maxCapacity: 5,
      minCapacity: 1,
    });
    writeScale.scaleOnUtilization({
      targetUtilizationPercent: 70, // porcentagem que triga o upscale
      scaleInCooldown: cdk.Duration.seconds(60), // tempo de espera entre 1 upscale e o seguinte
      scaleOutCooldown: cdk.Duration.seconds(60), // tempo de espera entre 1 downscale e o seguinte
    });*/
  }
}
