import * as cdk from "@aws-cdk/core";
import { ProductsFunctionStack } from "../stacks/productsFunction-stack";
import { EcommerceApiStack } from "../stacks/ecommerceApi-stack";
export class ECommerceStage extends cdk.Stage {
  public readonly urlOutput: cdk.CfnOutput;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const tags = {
      ["cost"]: "Ecommerce",
      ["team"]: "adrianosastre",
    };

    const productsFunctionStack = new ProductsFunctionStack(
      this,
      "ProductsFunctionStack",
      {
        tags: tags,
      }
    );

    const ecommerceApiStack = new EcommerceApiStack(
      this,
      "EcommerceApiStack",
      productsFunctionStack.handler,
      {
        tags: tags,
      }
    );
    ecommerceApiStack.addDependency(productsFunctionStack);

    this.urlOutput = ecommerceApiStack.urlOutput;
  }
}
