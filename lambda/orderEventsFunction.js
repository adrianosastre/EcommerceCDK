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

    // o lambda pode ser invocado com mais de uma mensagem para tratar

    const promises = [];

    event.Records.forEach((record) => { // mensagens publicadas na fila
        const body = JSON.parse(record.body);
        console.debug('record body:', body);
        promises.push(createEvent(body));
    });

    await Promise.all(promises);

    return {}; // deu certo a execuçãod o lambda
};

function createEvent(body) {
    const envelope = JSON.parse(body.Message);
    const event = JSON.parse(envelope.data);
    console.debug(`Message id: ${body.MessageId}`);

    const timestamp = Date.now();
    const ttl = ~~(timestamp / 1000 + (60 * 60)) // 1 hora no futuro

    const params = {
        TableName: eventsDdb,
        Item: {
            pk: `#order_${event.orderId}`,
            sk: `${envelope.eventType}#${timestamp}`,
            ttl: ttl,
            username: event.username,
            createdAt: timestamp,
            requestId: event.requestId,
            eventType: envelope.eventType,
            info: {
                orderId: event.orderId,
                productCodes: event.productCodes,
                messageId: body.MessageId,
            },
        },
    };

    try {
        return ddbClient.put(params).promise();
    } catch (err) {
        console.error(err);
    }
}