import type { Express } from "express";
import multer from "multer";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";

const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  app.post("/api/uploads/request-url", async (req, res) => {
    try {
      const { name, size, contentType } = req.body;

      if (!name) {
        return res.status(400).json({
          error: "Missing required field: name",
        });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();

      if (uploadURL.startsWith("__local__:")) {
        const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
        return res.json({
          uploadURL: "/api/uploads/direct",
          objectPath,
          useDirectUpload: true,
          metadata: { name, size, contentType },
        });
      }

      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({
        uploadURL,
        objectPath,
        useDirectUpload: false,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  app.post("/api/uploads/direct", uploadMemory.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const result = await objectStorageService.uploadFile(
        req.file.buffer,
        `uploads/${req.file.originalname}`,
        req.file.mimetype || "application/octet-stream"
      );

      res.json({
        objectPath: result.objectPath,
        url: result.url,
      });
    } catch (error) {
      console.error("Error uploading file directly:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  app.get("/objects/uploads/:objectId", async (req, res) => {
    try {
      const objectPath = `/objects/uploads/${req.params.objectId}`;
      
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });
}
