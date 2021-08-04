const AWS = require("aws-sdk");
const AWSXRay = require("aws-xray-sdk-core");
const xRay = AWSXRay.captureAWS(require("aws-sdk"));

const eventsDdb = process.env.EVENTS_DDB;
const awsRegion = process.env.AWS_REGION;
AWS.config.update({
    region: awsRegion,
});

const ddbClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async function (event, context) {

    console.log(event);

    const apiRequestId = event.requestContext.requestId;
    const lambdaRequestId = context.awsRequestId;
    console.log(`API Gateway RequestId: ${apiRequestId}​ - Lambda RequestId: ${lambdaRequestId}​​`);

    // GET /products/events/{code}
    // GET /products/events/{code}/{eventType}
    // GET /products/events?username=xxx
    // GET /products/events?usernameNoIndex=xxx

    if (event.resource === '/products/events/{code}') {
        const data = await getProductEventsByCode(event.pathParameters.code);
        return {
            body: JSON.stringify(convertItemsToEvents(data.Items))
        };
    } else if (event.resource === '/products/events/{code}/{eventType}') {
        const data = await getProductEventsByCodeAndEventType(event.pathParameters.code, event.pathParameters.eventType);
        return {
            body: JSON.stringify(convertItemsToEvents(data.Items))
        };
    } else if (event.resource === '/products/events') {
        if (event.queryStringParameters) {
            if (event.queryStringParameters.username) {
                const data = await getProductEventsByUsername(event.queryStringParameters.username); //with GSI
                return {
                    body: JSON.stringify(convertItemsToEvents(data.Items))
                };
            } else if (event.queryStringParameters.usernameNoIndex) {
                const data = await getProductEventsByUsernameNoIndex(event.queryStringParameters.usernameNoIndex); // without GSI
                return {
                    body: JSON.stringify(convertItemsToEvents(data.Items))
                };
            }
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

function convertItemsToEvents(items) {
    return items.map((item) => {
        return {
            createdAt: item.createdAt,
            eventType: item.sk.split('#')[0], // no banco = PRODUCT_CREATED#TIMESTAMP
            username: item.username,
            requestId: item.requestId,
            productId: item.info.productId,
            code: item.pk.split('_')[1], // no banco = product#CODE
        };
    });
}

function getProductEventsByCode(code) {
    const params = {
        TableName: eventsDdb,
        KeyConditionExpression: 'pk = :code',
        ExpressionAttributeValues: {
            ':code': `#product_${code}`,
        },
    };
    try {
        return ddbClient.query(params).promise();
    } catch (err) {
        return err;
    }
}

function getProductEventsByCodeAndEventType(code, eventType) {
    const params = {
        TableName: eventsDdb,
        KeyConditionExpression: 'pk = :code AND begins_with(sk, :eventType)',
        ExpressionAttributeValues: {
            ':code': `#product_${code}`,
            ':eventType': eventType,
        },
    };
    try {
        return ddbClient.query(params).promise();
    } catch (err) {
        return err;
    }
}

function getProductEventsByUsernameNoIndex(username) {
    const params = {
        TableName: eventsDdb,
        FilterExpression: 'username = :u AND begins_with(pk, :prefix)',
        ExpressionAttributeValues: {
            ':u': username,
            ':prefix': '#product_',
        }
    };
    try {
        return ddbClient.scan(params).promise();
    } catch (err) {
        return err;
    }
}

function getProductEventsByUsername(username) {
    const params = {
        TableName: eventsDdb,
        IndexName: 'usernameIdx',
        KeyConditionExpression: 'username = :u AND begins_with(pk, :prefix)',
        ExpressionAttributeValues: {
            ':u': username,
            ':pk': '#product_',
        },
    };
    try {
        return ddbClient.query(params).promise();
    } catch (err) {
        return err;
    }
}
