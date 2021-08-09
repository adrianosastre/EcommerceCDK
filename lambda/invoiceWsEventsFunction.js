const AWS = require("aws-sdk");

const AWSXRay = require("aws-xray-sdk-core");
const xRay = AWSXRay.captureAWS(require("aws-sdk"));

const awsRegion = process.env.AWS_REGION;
AWS.config.update({
  region: awsRegion,
});

exports.handler = async function (event, context) {

  console.log(event);

  const promises = [];

  event.Records.forEach(async (record) => {
    console.log('record:', record);

    //record.dynamodb.Keys.pk.S é melhor

    if (record.eventName === 'INSERT') {
      console.log(`newimage pk.s:`, record.dynamodb.NewImage.pk.S);
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

      if (record.dynamodb.OldImage.pk.S.startsWith('#invoice')) {
        // invoice event
        console.log(`Invoice event received`);
      } else if (record.dynamodb.OldImage.pk.S.startsWith('#transaction')) {
        // invoice transaction event
        console.log(`Invoice transaction event received`);

        const endpoint = record.dynamodb.OldImage.endpoint.S;
        const transactionId = record.dynamodb.OldImage.sk.S;
        const connectionId = record.dynamodb.OldImage.connectionId.S;

        const apiGwManagementApi = new AWS.ApiGatewayManagementApi({
          apiVersion: "2018-11-29",
          endpoint: endpoint,
        });

        const getConnectionResult = await apiGwManagementApi.getConnection({
          ConnectionId: connectionId,
        }).promise();
        console.log(getConnectionResult);

        if (record.dynamodb.OldImage.transactionStatus.S === 'INVOICE_PROCESSED') {
          console.log('Invoice processed with success');
        } else {
          console.warn('Timeout importing invoice, failed, last transaction status: ', record.dynamodb.OldImage.transactionStatus.S);

          await sendInvoiceStatus(apiGwManagementApi, transactionId, connectionId, 'TIMEOUT');
          await disconnectClient(apiGwManagementApi, connectionId);
        }
      }
    }
  });

  await Promise.all(promises);

  return {};
}

function disconnectClient(apiGwManagementApi, invoiceTransaction) {
  return apiGwManagementApi.deleteConnection({
    ConnectionId: invoiceTransaction.connectionId,
  }).promise();
}

function sendInvoiceStatus(apiGwManagementApi, transactionId, connectionId, status) {
  const postData = JSON.stringify({
    transactionId: transactionId,
    status: status,
  });

  return apiGwManagementApi.postToConnection({
    ConnectionId: connectionId,
    Data: postData,
  }).promise();
}

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
    return ddbClient.put(params).promise();
  } catch (err) {
    return err;
  }
}