const {
  SESClient,
  SendEmailCommand,
} = require("@aws-sdk/client-ses");

const ses = new SESClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const sendEmail = async ({ to, subject, html }) => {
  const command = new SendEmailCommand({
    Source: `Medinet360 <${process.env.SES_FROM_EMAIL}>`,
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: "UTF-8",
      },
      Body: {
        Html: {
          Data: html,
          Charset: "UTF-8",
        },
      },
    },
  });

  return ses.send(command);
};

module.exports = { sendEmail };
