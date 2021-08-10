const AWS = require("aws-sdk");
const uuid = require("uuid");

const AWSXRay = require("aws-xray-sdk-core");
const xRay = AWSXRay.captureAWS(require("aws-sdk"));

const productsDdb = process.env.PRODUCTS_DDB;
const ordersDdb = process.env.ORDERS_DDB;
const orderEventsTopicArn = process.env.ORDER_EVENTS_TOPIC_ARN;
const auditBusName = process.env.AUDIT_BUS_NAME;

const awsRegion = process.env.AWS_REGION;
AWS.config.update({
    region: awsRegion,
});

const ddbClient = new AWS.DynamoDB.DocumentClient();
const snsClient = new AWS.SNS();
const eventBridgeClient = new AWS.EventBridge();

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
                        const data = await getOrder(event.queryStringParameters.username, event.queryStringParameters.orderId);
                        if (data.Item) {
                            return {
                                statusCode: 200,
                                body: JSON.stringify(convertToOrderResponse(data.Item)),
                            };
                        } else {
                            return {
                                statusCode: 404,
                                body: JSON.stringify(`Order with username ${event.queryStringParameters.username} and id ${event.queryStringParameters.orderId} not found`),
                            };
                        }
                    } else { // orders by username
                        const data = await getOrdersByUsername(event.queryStringParameters.username);
                        return {
                            statusCode: 200,
                            body: JSON.stringify(data.Items.map(convertToOrderResponse)),
                        };
                    }
                }
            } else { // all orders
                const data = await getAllOrders();
                return {
                    statusCode: 200,
                    body: JSON.stringify(data.Items.map(convertToOrderResponse)),
                }
            }
        } else if (method === 'POST') {
            const orderRequest = JSON.parse(event.body);
            const result = await fetchProducts(orderRequest); // resultado da consulta do dynamo
            if (result.Responses.ProductsDdb.length == orderRequest.productIds.length) {
                const products = [];
                result.Responses.ProductsDdb.forEach((product) => {
                    console.log(product);
                    products.push(product);
                });
                const orderCreated = await createOrder(orderRequest, products);
                console.log(orderCreated);

                const eventResult = await sendOrderEvent(orderCreated, 'ORDER_CREATED', lambdaRequestId);
                console.debug(`Order created event sent, order Id: ${orderCreated.sk}, message id: ${eventResult.MessageId} `);

                return {
                    statusCode: 201,
                    body: JSON.stringify(convertToOrderResponse(orderCreated)),
                }
            } else {
                return {
                    statusCode: 404,
                    body: 'Some products were not found',
                }
            }
        } else if (method === 'DELETE') {
            if (event.queryStringParameters &&
                event.queryStringParameters.username &&
                event.queryStringParameters.orderId) {
                const data = await getOrder(event.queryStringParameters.username, event.queryStringParameters.orderId);
                if (data.Item) {
                    const deleteOrderPromise = deleteOrder(event.queryStringParameters.username, event.queryStringParameters.orderId);

                    const deleteOrderEventPromise = sendOrderEvent(data.Item, 'ORDER_DELETED', lambdaRequestId);

                    const results = await Promise.all([deleteOrderPromise, deleteOrderEventPromise]);

                    console.debug(`Order deleted event sent, order Id: ${data.Item.sk}, message id: ${results[1].MessageId} `);

                    return {
                        statusCode: 200,
                        body: JSON.stringify(convertToOrderResponse(data.Item)),
                    };
                } else {
                    const params = {
                        Entries: [{
                            EventBusName: auditBusName,
                            Source: 'app.order',
                            DetailType: 'order',
                            Time: new Date(),
                            Detail: JSON.stringify({ // detail é um JSON livre
                                reason: 'PRODUCT_NOT_FOUND',
                                orderRequest: orderRequest,
                            }),
                        }, ],
                    };
                    const result = await eventBridgeClient.putEvents(params).promise(); //publicou no event bus
                    console.log(result);

                    return {
                        statusCode: 404,
                        body: JSON.stringify(`Order with username ${event.queryStringParameters.username} and id ${event.queryStringParameters.orderId} not found`),
                    };
                }
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

function sendOrderEvent(order, eventType, lambdaRequestId) {
    const productCodes = [];
    order.products.forEach((product) => {
        productCodes.push(product.code);
    });

    const orderEvent = {
        username: order.pk,
        orderId: order.sk,
        shipping: order.shipping,
        productCodes: productCodes,
        requestId: lambdaRequestId,
    };

    const envelope = {
        eventType: eventType,
        data: JSON.stringify(orderEvent),
    };

    const params = {
        Message: JSON.stringify(envelope),
        TopicArn: orderEventsTopicArn,
        MessageAttributes: {
            eventType: {
                DataType: 'String',
                StringValue: eventType, //ex: ORDER_CREATED or ORDER_DELETED
            },
        },
    };

    return snsClient.publish(params).promise();
}

function deleteOrder(username, orderId) {
    const params = {
        TableName: ordersDdb,
        Key: {
            pk: username,
            sk: orderId,
        },
    };
    try {
        return ddbClient.delete(params).promise();
    } catch (err) {
        return err;
    }
}

function getOrder(username, orderId) {
    const params = {
        TableName: ordersDdb,
        Key: {
            pk: username,
            sk: orderId,
        },
    };
    try {
        return ddbClient.get(params).promise();
    } catch (err) {
        return err;
    }
}

function getOrdersByUsername(username) {
    const params = {
        TableName: ordersDdb,
        KeyConditionExpression: 'pk = :username',
        ExpressionAttributeValues: {
            ':username': username,
        },
    };
    try {
        return ddbClient.query(params).promise();
    } catch (err) {
        console.error(err);
    }
}

function getAllOrders() {
    const params = {
        TableName: ordersDdb
    };
    try {
        return ddbClient.scan(params).promise();
    } catch (err) {
        console.error(err);
    }
}

function convertToOrderResponse(order) { // Resposta da API
    return {
        username: order.pk,
        id: order.sk,
        createdAt: order.createdAt,
        products: order.products,
        billing: order.billing,
        shipping: order.shipping,
    };
}

async function createOrder(orderRequest, products) { // Criando pedido no dynamo
    const timestamp = Date.now();
    const orderProducts = [];
    let totalPrice = 0;

    products.forEach((product) => {
        totalPrice += product.price;

        orderProducts.push({
            code: product.code,
            price: product.price,
            id: product.id,
        });
    });

    const orderItem = {
        pk: orderRequest.username,
        sk: uuid.v4(),
        createdAt: timestamp,
        billing: {
            payment: orderRequest.payment,
            totalPrice: totalPrice,
        },
        shipping: {
            type: orderRequest.shipping.type,
            carrier: orderRequest.shipping.carrier,
        },
        products: orderProducts,
    };

    const params = {
        TableName: ordersDdb,
        Item: orderItem,
    };

    try {
        await ddbClient.put(params).promise();
        return orderItem;
    } catch (err) {
        return err;
    }
}

function fetchProducts(orderRequest) { // buscando os produtos
    const keys = [];
    orderRequest.productIds.forEach((productId) => {
        keys.push({
            id: productId,
        });
    });

    const params = {
        RequestItems: {
            [productsDdb]: {
                Keys: keys,
            }
        }
    };
    console.log('batchGet params:', params);

    try {
        return ddbClient.batchGet(params).promise(); // economiza tempo de acesso no dynamo
    } catch (err) {
        console.error(err);
    }
}