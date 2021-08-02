const AWS = require("aws-sdk");
const uuid = require("uuid");

const AWSXRay = require("aws-xray-sdk-core");
const xRay = AWSXRay.captureAWS(require("aws-sdk"));

const productsDdb = process.env.PRODUCTS_DDB;
const ordersDdb = process.env.ORDERS_DDB;

const awsRegion = process.env.AWS_REGION;
AWS.config.update({
    region: awsRegion,
});

const ddbClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async function (event, context) {

    const method = event.httpMethod;
    console.log(event);
    const apiRequestId = event.requestContext.requestId;
    const lambdaRequestId = context.awsRequestId;
    console.log(`API Gateway RequestId: ${apiRequestId}​ - Lambda RequestId: ${lambdaRequestId}​​`);

    if (event.resource === '/orders') {
        if (method === 'GET') {
            if (event.queryStringParameters) {
                if (event.queryStringParameters.username) {
                    if (event.queryStringParameters.orderId) { // orders by username and order id

                    } else { // orders by username

                    }
                }
            } else { // all orders

            }
        } else if (method === 'POST') {

        }
    }

    return {
        statusCode: 400,
        headers: {},
        body: JSON.stringify({
            message: "Bad request",
            ApiGwRequestId: apiRequestId,
            LambdaRequestId: lambdaRequestId,
        }),
    };
};