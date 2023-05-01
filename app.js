import express from "express";
import { addJobToNotion, updatePageWithQrCode } from "./server/notion.js";
import multer from "multer";
import fs from "fs";
import xml2js from "xml2js";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const upload = multer();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile("public/index.html");
});

app.post("/create-job", upload.none(), async (req, res) => {
  try {
    const {
      customer,
      job,
      colorName,
      address,
      date,
      finish,
      texture,
      formula,
    } = req.body;

    const jobData = {
      customer,
      job,
      colorName,
      address,
      date,
      finish,
      texture,
      formula,
      color: "",
    };

    const { response: notionResponse, pageUrl } = await addJobToNotion(jobData);

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(
      pageUrl
    )}`;

    await updatePageWithQrCode(notionResponse.id, qrCodeUrl);

    res.json({ qrCodeUrl: qrCodeUrl });
  } catch (error) {
    console.error("Error in /create-job:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/generate-label", async (req, res) => {
  const { jobId, qrCodeUrl } = req.body;

  try {
    const labelTemplatePath = "uploads/template.xml";

    const customerName = req.body.customer.replace(/\s+/g, "-");
    const jobName = req.body.job.replace(/\s+/g, "-");
    const newLabelFilePath = `uploads/${customerName}-${jobName}.dymo`;

    // Read the label template file
    fs.readFile(labelTemplatePath, "utf8", async (err, data) => {
      if (err) {
        console.error("Error reading the label template:", err);
        res.status(500).send({ error: "Error reading the label template" });
        return;
      }

      // Parse the XML content
      const parser = new xml2js.Parser();
      const builder = new xml2js.Builder();
      const parsedXml = await parser.parseStringPromise(data);

      function findQRCodeObject(obj) {
        if (obj.QRCodeObject) {
          return obj.QRCodeObject[0];
        }

        for (const key in obj) {
          if (typeof obj[key] === "object") {
            const result = findQRCodeObject(obj[key]);
            if (result) {
              return result;
            }
          }
        }

        return null;
      }

      // Update the QR code URL in the parsed XML
      const qrCodeObject = findQRCodeObject(parsedXml);
      console.log(qrCodeObject);
      if (!qrCodeObject || !qrCodeObject.Data) {
        console.error(
          "Error: QR code object or data not found in label template."
        );
        res.status(500).send({ error: "Error creating label" });
        return;
      }
      qrCodeObject.Data[0].DataString[0] = qrCodeUrl;
      qrCodeObject.WebAddressDataHolder[0].DataString[0] = qrCodeUrl;

      // Build the updated XML content
      const updatedXml = builder.buildObject(parsedXml);

      // Save the updated .label file with a unique name
      fs.writeFile(newLabelFilePath, updatedXml, "utf8", (err) => {
        if (err) {
          console.error("Error saving the new label file:", err);
          res.status(500).send({ error: "Error saving the new label file" });
          return;
        }

        // Send the new label file path to the client
        res.status(200).send({ newLabelFilePath: newLabelFilePath });
      });
    });
  } catch (error) {
    console.error("Error generating the new label file:", error);
    res.status(500).send({ error: "Error generating the new label file" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
