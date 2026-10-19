import path from "path";
import fs from "fs";
import express from "express";
import multer from "multer";
import nodemailer from "nodemailer";
import { createServer as createViteServer } from "vite";
import { put } from "@vercel/blob";

// Carica variabili da .env se presente
try {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    content.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    });
  }
} catch (err) {
  console.warn("Impossibile leggere file .env:", err);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB per file
    fieldSize: 25 * 1024 * 1024, // 25 MB per campo JSON
    files: 20,
  },
});

const fmt = (v: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "25mb" }));

  // API routes FIRST
  app.get("/api/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.json({ status: "ok", ts: Date.now() });
  });

  // Se il proxy nginx converte una POST in GET tramite 302 durante il refresh del token,
  // rispondiamo in JSON chiedendo al client di ritentare subito la POST (con cache ora calda).
  app.get("/api/send-order-email", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(409).json({ retryPost: true });
  });

  app.post("/api/avatar/upload", async (req, res) => {
    try {
      const filename = req.query.filename as string;
      if (!filename) {
        return res.status(400).json({ error: "Filename is required" });
      }

      const blob = await put(filename, req, {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      res.json(blob);
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  // Endpoint per inviare l'ordine + file PDF allegati via Email
  app.post("/api/send-order-email", upload.array("files", 20), async (req, res) => {
    try {
      const rawOrderData = req.body?.orderData;
      if (!rawOrderData) {
        return res.status(400).json({ error: "Dati ordine mancanti" });
      }

      const order = typeof rawOrderData === "string" ? JSON.parse(rawOrderData) : rawOrderData;
      const uploadedFiles = (req.files as Express.Multer.File[]) || [];

      const smtpUser = process.env.SMTP_USER || "sudpen.consulenze@gmail.com";
      const smtpPass = process.env.SMTP_PASS || "jzbj tqbf llsw btpi";
      const recipients =
        process.env.ORDER_NOTIFICATION_EMAIL || "sudpen.consulenze@gmail.com,sudpenostuni@gmail.com";

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      const orderIdShort = order.orderId ? String(order.orderId).slice(0, 10).toUpperCase() : "NUOVO";
      const clienteNome = order.cliente || "Cliente Web";
      const clienteTel = order.telefono || "Non specificato";
      const isSda = order.tipoConsegna === "spedizione_sda";
      const consegnaLabel = isSda
        ? `Spedizione Corriere SDA (${order.costoSpedizione === 0 ? "GRATIS" : fmt(order.costoSpedizione)})`
        : "Ritiro in sede Ostuni (Gratuito)";

      const cleanPhoneDigits = clienteTel.replace(/[^0-9+]/g, "");
      const waClientUrl = cleanPhoneDigits
        ? `https://api.whatsapp.com/send?phone=${cleanPhoneDigits.startsWith("+") || cleanPhoneDigits.startsWith("39") ? cleanPhoneDigits.replace("+", "") : "39" + cleanPhoneDigits}`
        : "";

      const itemsList: any[] = Array.isArray(order.items) ? order.items : [];

      const itemsRowsHtml = itemsList
        .map(
          (item, i) => `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 8px; font-weight: 700; color: #0f172a;">#${i + 1} ${item.name || "Fascicolo"}${item.fileName ? `<br/><span style="font-size: 11px; font-weight: 400; color: #64748b;">📄 ${item.fileName}</span>` : ""}</td>
            <td style="padding: 10px 8px; color: #334155;">${item.rilegatura || "-"}${item.isOmaggio ? ' <span style="color:#059669;font-weight:700;">(OMAGGIO)</span>' : ""}</td>
            <td style="padding: 10px 8px; text-align: center; color: #334155;">${item.bwPages || 0} B&N / ${item.colorPages || 0} Col.${item.isBwOnly ? '<br/><span style="font-size:10px;background:#0f172a;color:#fff;padding:2px 5px;border-radius:4px;">TUTTO B&N</span>' : ""}</td>
            <td style="padding: 10px 8px; text-align: center; font-weight: 700; color: #0f172a;">x${item.cps || 1}</td>
            <td style="padding: 10px 8px; text-align: right; font-weight: 700; color: #059669;">${fmt(item.costoSubtotale || 0)}</td>
          </tr>`
        )
        .join("");

      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 680px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
          <div style="background: #0f172a; color: #ffffff; padding: 20px 24px;">
            <h2 style="margin: 0; font-size: 18px; text-transform: uppercase; letter-spacing: 0.5px;">
              📦 Nuovo Ordine Stampe #${orderIdShort}
            </h2>
            <p style="margin: 4px 0 0; font-size: 12px; color: #94a3b8;">
              ${order.isConvenzione ? "Convenzione Oxford College Mita" : "Sudpen Stampe & Rilegature • Ostuni"}
            </p>
          </div>

          <div style="padding: 24px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
              <h3 style="margin: 0 0 10px; font-size: 13px; text-transform: uppercase; color: #475569;">Dati Cliente & Consegna</h3>
              <p style="margin: 4px 0; font-size: 14px; color: #0f172a;"><strong>👤 Cliente:</strong> ${clienteNome}</p>
              <p style="margin: 4px 0; font-size: 14px; color: #0f172a;">
                <strong>📱 Cellulare:</strong> <a href="tel:${clienteTel}" style="color: #059669; font-weight: 700; text-decoration: none;">${clienteTel}</a>
                ${waClientUrl ? ` &nbsp;•&nbsp; <a href="${waClientUrl}" style="background: #10b981; color: #fff; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; text-decoration: none;">Contatta su WhatsApp</a>` : ""}
              </p>
              <p style="margin: 4px 0; font-size: 14px; color: #0f172a;"><strong>🚚 Modalità Consegna:</strong> ${consegnaLabel}</p>
              ${isSda && order.indirizzoSpedizione ? `<p style="margin: 4px 0; font-size: 14px; color: #0f172a;"><strong>📍 Indirizzo SDA:</strong> ${order.indirizzoSpedizione}</p>` : ""}
              <p style="margin: 4px 0; font-size: 12px; color: #64748b;"><strong>🆔 ID Firebase:</strong> ${order.orderId || "N/D"}</p>
            </div>

            <h3 style="margin: 0 0 10px; font-size: 13px; text-transform: uppercase; color: #475569;">Fascicoli Ordinati (${itemsList.length})</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
              <thead>
                <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; text-align: left;">
                  <th style="padding: 8px;">Documento</th>
                  <th style="padding: 8px;">Rilegatura</th>
                  <th style="padding: 8px; text-align: center;">Pagine</th>
                  <th style="padding: 8px; text-align: center;">Copie</th>
                  <th style="padding: 8px; text-align: right;">Subtotale</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRowsHtml}
              </tbody>
            </table>

            <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 16px; text-align: right;">
              ${order.totaleScontoRilegature > 0 ? `<p style="margin: 0 0 4px; font-size: 13px; color: #047857;">Sconti / Promo applicati: <strong>-${fmt(order.totaleScontoRilegature)}</strong></p>` : ""}
              <p style="margin: 0; font-size: 20px; font-weight: 900; color: #065f46;">
                TOTALE ORDINE: ${fmt(order.totale)}
              </p>
              <p style="margin: 4px 0 0; font-size: 11px; color: #047857;">
                File PDF allegati a questa email: <strong>${uploadedFiles.length}</strong>
              </p>
            </div>
          </div>
        </div>
      `;

      const attachments = uploadedFiles.map((file) => ({
        filename: file.originalname,
        content: file.buffer,
        contentType: file.mimetype || "application/pdf",
      }));

      await transporter.sendMail({
        from: `"Sudpen Ordini Stampe" <${smtpUser}>`,
        to: recipients,
        subject: `📦 Nuovo Ordine Stampe #${orderIdShort} - ${clienteNome} (${fmt(order.totale)})`,
        html: htmlBody,
        attachments,
      });

      res.json({
        success: true,
        attachmentsCount: uploadedFiles.length,
      });
    } catch (error: any) {
      console.error("Errore invio email ordine:", error);
      res.status(500).json({
        error: "Errore durante l'invio dell'email con i file allegati",
        details: error?.message || String(error),
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static files from dist
    app.use(express.static("dist"));
    app.use((_req, res) => {
      res.sendFile(path.resolve(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

