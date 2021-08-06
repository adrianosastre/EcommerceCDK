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
  console.log('event:', event);

  const promises = [];

  event.Records.forEach((record) => {
    console.log('record:', record);

    if (record.eventName === 'INSERT') {
      if (record.dynamodb.NewImage.pk.S.startsWith('#invoice')) {
        // invoice event
        console.log(`Invoice event received`);
        promise.push(createEvent(record.dynamodb.NewImage, 'INVOICE_CREATED'));
      } else if (record.dynamodb.NewImage.pk.S.startsWith('#transaction')) {
        // invoice transaction event
        console.log(`Invoice transaction event received`);
      }
    } else if (record.eventName === 'MODIFY') {

    } else if (record.eventName === 'REMOVE') {

      if (record.dynamodb.NewImage.pk.S.startsWith('#invoice')) {
        // invoice event
        console.log(`Invoice event received`);
      } else if (record.dynamodb.NewImage.pk.S.startsWith('#transaction')) {
        // invoice transaction event
        console.log(`Invoice transaction event received`);
        if (record.dynamodb.OldImage.transactionStatus.S === 'INVOICE_PROCESSED') {
          console.log('Invoice processed with success');
        } else {
          console.warn('Timeout importing invoice, failed, last transaction status: ', record.dynamodb.OldImage.transactionStatus.S);
        }
      }
    }
  });

  await Promise.all(promises);

  return {};
};

function createEvent(item, eventType) {
  const timestamp = Date.now();
  const ttl = ~~(timestamp / 1000 + 60 * 60); // 1hora
  const params = {
    TableName: eventsDdb,
    Item: {
      pk: `#invoice_${item.sk.S}`, // #invoice_abc-123 - valor da invoice na tabela de invoices
      sk: `${eventType}#${timestamp}`, //INVOICE_CREATED_45646
      ttl: ttl,
      username: item.pk.S.split('_')[1],
      createdAt: timestamp,
      eventType: eventType,
      info: {
        transactionId: item.transactionId.S,
        productId: item.productId.S,
      },
    }
  };

  try {
    await ddbClient.put(params).promise();
  } catch (err) {
    return err;
  }
}