import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type { Invoice, Customer } from "../types";
import { supabase } from "./supabaseClient";
import dayjs from "dayjs";

export const professionalInvoiceService = {
  // Generate professional invoice in both formats
  async generateInvoice(
    invoice: Invoice,
    format: "pdf" | "jpg" = "pdf",
    includeLetterhead: boolean = true
  ): Promise<Blob | string> {
    try {
      // Get user letterhead if requested
      let letterheadUrl: string | null = null;
      if (includeLetterhead) {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();

        if (authUser) {
          const { data: profile } = await supabase
            .from("users")
            .select("letterhead_url")
            .eq("id", authUser.id)
            .single();

          letterheadUrl = profile?.letterhead_url || null;
        }
      }

      if (format === "jpg") {
        // Generate JPG with letterhead
        const jpgData = await this.generateJPGInvoice(invoice, letterheadUrl);
        return jpgData;
      } else {
        // Generate PDF with letterhead
        const pdfBlob = await this.generatePDFInvoice(invoice, letterheadUrl);
        return pdfBlob;
      }
    } catch (error) {
      console.error("Error generating invoice:", error);
      throw error;
    }
  },

  // Generate PDF invoice (working correctly - keep as is)
  async generatePDFInvoice(
    invoice: Invoice,
    letterheadUrl: string | null
  ): Promise<Blob> {
    // Create PDF in inches for easier measurement
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "in",
      format: "a4",
    });

    const pageWidth = 8.27; // A4 width in inches
    const pageHeight = 11.69; // A4 height in inches

    // 3-inch margin from top
    const topMargin = 3.0;
    const margin = 0.5; // Side margins in inches
    let currentY = topMargin;

    // Add letterhead as background if available
    if (letterheadUrl) {
      await this.addLetterheadToPDF(doc, letterheadUrl);
    }

    // Add invoice content
    await this.addPDFContent(doc, invoice, margin, currentY, pageWidth);

    return doc.output("blob");
  },

  // Add letterhead to PDF
  async addLetterheadToPDF(doc: jsPDF, letterheadUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        try {
          const pageWidth = doc.internal.pageSize.getWidth();
          const pageHeight = doc.internal.pageSize.getHeight();

          // Add image to cover entire page with very light opacity
          doc.addImage(img, "JPEG", 0, 0, pageWidth, pageHeight);
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = reject;
      img.src = letterheadUrl + "?t=" + Date.now();
    });
  },

  // Add content to PDF with clean, simple layout (keep as is)
  async addPDFContent(
    doc: jsPDF,
    invoice: Invoice,
    margin: number,
    startY: number,
    pageWidth: number
  ): Promise<void> {
    // Colors
    const primaryColor = [52, 152, 219]; // Blue
    const textColor = [60, 60, 60]; // Dark gray
    const accentColor = [46, 204, 113]; // Green

    let currentY = startY;

    // Table setup - centered
    const colWidths = [3.5, 0.8, 1.2, 1.2]; // Description, Qty, Rate, Amount in inches
    const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);
    const tableX = (pageWidth - tableWidth) / 2;

    // Bill To Section - Left aligned with table
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text("BILL TO:", tableX, currentY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);

    const customer = invoice.customer;
    if (customer) {
      doc.setFont("helvetica", "bold");
      doc.text(customer.company_name || "", tableX, currentY + 0.18);

      doc.setFont("helvetica", "normal");
      let customerY = currentY + 0.36;

      if (customer.address) {
        doc.text(customer.address, tableX, customerY);
        customerY += 0.18;
      }

      if (customer.mobile) {
        doc.text(`Phone: ${customer.mobile}`, tableX, customerY);
        customerY += 0.18;
      }

      if (customer.email) {
        doc.text(`Email: ${customer.email}`, tableX, customerY);
        customerY += 0.18;
      }

      currentY = Math.max(currentY + 0.9, customerY);
    } else {
      currentY += 0.36;
    }

    currentY += 0.3;

    // Invoice Info Section - Right aligned
    const invoiceInfoX = tableX + tableWidth;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text("INVOICE", invoiceInfoX, startY, { align: "right" });

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);

    doc.text(`# ${invoice.invoice_number}`, invoiceInfoX, startY + 0.18, {
      align: "right",
    });
    doc.text(
      `Date: ${dayjs(invoice.issue_date).format("DD/MM/YYYY")}`,
      invoiceInfoX,
      startY + 0.36,
      { align: "right" }
    );
    doc.text(
      `Due: ${dayjs(invoice.due_date).format("DD/MM/YYYY")}`,
      invoiceInfoX,
      startY + 0.54,
      { align: "right" }
    );

    // Move down after header section
    currentY = Math.max(currentY, startY + 0.8);

    // Table Header
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(tableX, currentY, tableWidth, 0.2, "F");

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);

    let xPos = tableX;
    const headers = ["Description", "Qty", "Rate", "Amount"];

    headers.forEach((header, index) => {
      const align = index === 0 ? "left" : index === 3 ? "right" : "center";
      if (align === "right") {
        doc.text(header, xPos + colWidths[index] - 0.1, currentY + 0.14, {
          align: "right",
        });
      } else if (align === "center") {
        doc.text(header, xPos + colWidths[index] / 2, currentY + 0.14, {
          align: "center",
        });
      } else {
        doc.text(header, xPos + 0.1, currentY + 0.14);
      }
      xPos += colWidths[index];
    });

    currentY += 0.25;

    // Table Rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);

    invoice.items?.forEach((item, index) => {
      // Check for page break
      if (currentY > 10.5) {
        // Leave room for totals
        doc.addPage();
        currentY = margin;
      }

      xPos = tableX;

      // Description
      const description = item.description || "";
      const maxWidth = colWidths[0] - 0.2;
      const lines = doc.splitTextToSize(description, maxWidth);

      lines.forEach((line, lineIndex) => {
        doc.text(line, xPos + 0.1, currentY + 0.12 + lineIndex * 0.15);
      });

      const descHeight = Math.max(0.15, lines.length * 0.15);
      xPos += colWidths[0];

      // Quantity
      doc.text(
        (item.quantity || 0).toString(),
        xPos + colWidths[1] / 2,
        currentY + 0.12,
        {
          align: "center",
        }
      );
      xPos += colWidths[1];

      // Rate
      doc.text(
        `PKR ${(item.rate || 0).toLocaleString()}`,
        xPos + colWidths[2] / 2,
        currentY + 0.12,
        {
          align: "center",
        }
      );
      xPos += colWidths[2];

      // Amount
      doc.setFont("helvetica", "bold");
      doc.text(
        `PKR ${(item.amount || 0).toLocaleString()}`,
        xPos + colWidths[3] - 0.1,
        currentY + 0.12,
        {
          align: "right",
        }
      );
      doc.setFont("helvetica", "normal");

      currentY += descHeight + 0.1;
    });

    currentY += 0.3;

    // Totals Section
    const totalsX = tableX + tableWidth - 2.0;

    // Subtotal
    doc.setFontSize(11);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);

    doc.text("Subtotal:", totalsX, currentY, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(
      `PKR ${(invoice.total_amount || 0).toLocaleString()}`,
      tableX + tableWidth,
      currentY,
      {
        align: "right",
      }
    );
    currentY += 0.18;

    // Paid Amount
    doc.setFont("helvetica", "normal");
    doc.text("Paid Amount:", totalsX, currentY, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(
      `PKR ${(invoice.paid_amount || 0).toLocaleString()}`,
      tableX + tableWidth,
      currentY,
      {
        align: "right",
      }
    );
    currentY += 0.18;

    // Balance Due with separator
    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setLineWidth(0.01);
    doc.line(totalsX, currentY + 0.05, tableX + tableWidth, currentY + 0.05);
    currentY += 0.1;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text("Balance Due:", totalsX, currentY, { align: "right" });
    doc.text(
      `PKR ${(invoice.pending_amount || 0).toLocaleString()}`,
      tableX + tableWidth,
      currentY,
      {
        align: "right",
      }
    );
    currentY += 0.3;

    // Notes and Terms
    if (invoice.notes || invoice.payment_terms) {
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.005);
      doc.line(tableX, currentY, tableX + tableWidth, currentY);
      currentY += 0.15;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);

      if (invoice.notes) {
        doc.setFont("helvetica", "bold");
        doc.text("Notes:", tableX, currentY);
        doc.setFont("helvetica", "normal");
        const notesLines = doc.splitTextToSize(invoice.notes, tableWidth);
        doc.text(notesLines, tableX, currentY + 0.12);
        currentY += 0.12 + notesLines.length * 0.1;
      }

      if (invoice.payment_terms) {
        if (invoice.notes) currentY += 0.1;
        doc.setFont("helvetica", "bold");
        doc.text("Payment Terms:", tableX, currentY);
        doc.setFont("helvetica", "normal");
        const termsLines = doc.splitTextToSize(
          invoice.payment_terms,
          tableWidth
        );
        doc.text(termsLines, tableX, currentY + 0.12);
      }
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Generated on ${dayjs().format("DD/MM/YYYY HH:mm")}`,
      pageWidth / 2,
      11.2,
      { align: "center" }
    );
  },

  // Generate JPG invoice with letterhead - FIXED VERSION
  async generateJPGInvoice(
    invoice: Invoice,
    letterheadUrl: string | null
  ): Promise<string> {
    try {
      // Generate HTML with proper structure
      const html = await this.generateInvoiceHTML(invoice, letterheadUrl);

      // Create a temporary container with A4 dimensions
      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "0";
      container.style.top = "0";
      container.style.width = "794px"; // A4 width at 96 DPI
      container.style.height = "1123px"; // A4 height at 96 DPI
      container.style.backgroundColor = "white";
      container.style.zIndex = "9999";
      container.style.padding = "0";
      container.style.margin = "0";
      container.style.overflow = "hidden";
      container.style.boxSizing = "border-box";
      container.innerHTML = html;
      document.body.appendChild(container);

      // Wait for images to load
      await new Promise<void>((resolve) => {
        const images = container.querySelectorAll("img");
        let loadedCount = 0;
        const totalImages = images.length;

        if (totalImages === 0) {
          setTimeout(resolve, 100);
          return;
        }

        const imageLoaded = () => {
          loadedCount++;
          if (loadedCount === totalImages) {
            setTimeout(resolve, 100);
          }
        };

        images.forEach((img) => {
          if (img.complete) {
            loadedCount++;
            if (loadedCount === totalImages) {
              setTimeout(resolve, 100);
            }
          } else {
            img.addEventListener("load", imageLoaded);
            img.addEventListener("error", imageLoaded); // Even if error, continue
          }
        });
      });

      // Use html2canvas with proper settings
      const canvas = await html2canvas(container, {
        scale: 2, // High quality - KEEP THIS ONE
        useCORS: true,
        backgroundColor: null, // Transparent background
        logging: false,
        allowTaint: true,
        removeContainer: false,
        width: 794,
        height: 1123,
        windowWidth: 794,
        windowHeight: 1123,
        dpi: 96, // Explicitly set DPI
        // REMOVED DUPLICATE scale: 2,
      });

      // Get JPG data
      const imageData = canvas.toDataURL("image/jpeg", 0.95);

      // Clean up
      document.body.removeChild(container);

      return imageData;
    } catch (error) {
      console.error("Error generating JPG invoice:", error);
      throw error;
    }
  },

  // Generate HTML for JPG - FIXED with proper 3-inch margin and visible letterhead
  async generateInvoiceHTML(
    invoice: Invoice,
    letterheadUrl: string | null
  ): Promise<string> {
    const customer = invoice.customer;
    const totalAmount = invoice.total_amount || 0;
    const paidAmount = invoice.paid_amount || 0;
    const pendingAmount = invoice.pending_amount || 0;

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          line-height: 1.4;
          color: #333;
          background: white;
          width: 794px; /* A4 width at 96 DPI */
          height: 1123px; /* A4 height at 96 DPI */
          margin: 0;
          padding: 0;
          position: relative;
        }
        
        .letterhead-container {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
        }
        
        .letterhead-background {
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0.9;
        }
        
        .content-container {
          position: relative;
          z-index: 1;
          width: 100%;
          height: 100%;
          padding-top: 250px; /* 3 inches = 144px at 72 DPI (html2canvas uses 72 DPI) */
          padding-left: 60px;
          padding-right: 60px;
          box-sizing: border-box;
        }
        
        .header-section {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 30px;
        }
        
        .bill-to {
          flex: 1;
        }
        
        .bill-to h3 {
          color: #3498db;
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 8px;
          text-transform: uppercase;
        }
        
        .customer-name {
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 6px;
          font-size: 14px;
        }
        
        .customer-detail {
          color: #555;
          font-size: 12px;
          margin-bottom: 4px;
          line-height: 1.4;
        }
        
        .invoice-info {
          text-align: right;
        }
        
        .invoice-title {
          font-size: 20px;
          font-weight: 700;
          color: #3498db;
          margin-bottom: 8px;
        }
        
        .invoice-number {
          font-size: 15px;
          font-weight: 600;
          color: #333;
          margin-bottom: 6px;
        }
        
        .invoice-date, .invoice-due {
          font-size: 12px;
          color: #555;
          margin-bottom: 3px;
        }
        
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0 15px 0;
          font-size: 12px;
        }
        
        .items-table thead {
          background: #3498db;
        }
        
        .items-table th {
          padding: 10px 8px;
          text-align: left;
          font-weight: 600;
          font-size: 14px;
          color: white;
          text-transform: uppercase;
        }
        
        .items-table th:first-child {
          width: 50%;
          padding-left: 10px;
        }
        
        .items-table th:nth-child(2) {
          width: 12%;
          text-align: center;
        }
        
        .items-table th:nth-child(3) {
          width: 18%;
          text-align: center;
        }
        
        .items-table th:last-child {
          width: 20%;
          text-align: right;
          padding-right: 10px;
        }
        
        .items-table td {
          padding: 8px 8px;
          border-bottom: 1px solid #f0f0f0;
          font-size: 16px;
        }
        
        .items-table td:first-child {
          padding-left: 10px;
        }
        
        .items-table td:last-child {
          text-align: right;
          font-weight: 600;
          color: #1e293b;
          padding-right: 10px;
        }
        
        .items-table td:nth-child(2),
        .items-table td:nth-child(3) {
          text-align: center;
        }
        
        .items-table tr:nth-child(even) {
          background-color: rgba(248, 250, 252, 0.5);
        }
        
        .totals-section {
          margin-top: 20px;
          text-align: right;
        }
        
        .total-row {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 6px;
        }
        
        .total-label {
          color: #555;
          font-size: 16px;
          width: 100px;
          text-align: right;
          padding-right: 15px;
        }
        
        .total-value {
          font-weight: 600;
          color: #333;
          font-size: 16px;
          width: 120px;
          text-align: right;
        }
        
        .balance-due {
          display: flex;
          justify-content: flex-end;
          margin-top: 10px;
          padding-top: 10px;
          border-top: 2px solid #3498db;
        }
        
        .balance-label {
          color: #ff0000ff;
          font-weight: 700;
          font-size: 14px;
          width: 100px;
          text-align: right;
          padding-right: 15px;
        }
        
        .balance-value {
          color: #ff0000ff;
          font-weight: 700;
          font-size: 14px;
          width: 120px;
          text-align: right;
        }
        
        .notes-section {
          margin-top: 30px;
          padding-top: 15px;
          border-top: 1px solid #e5e7eb;
        }
        
        .notes-title {
          color: #1e293b;
          font-weight: 600;
          font-size: 12px;
          margin-bottom: 6px;
        }
        
        .notes-content {
          color: #555;
          font-size: 11px;
          line-height: 1.4;
        }
        
        .footer {
          position: absolute;
          bottom: 20px;
          left: 60px;
          right: 60px;
          text-align: center;
          color: #888;
          font-size: 9px;
          padding-top: 15px;
          border-top: 1px solid #eee;
        }
      </style>
    </head>
    <body>
      <!-- Letterhead Background -->
      ${
        letterheadUrl
          ? `
        <div class="letterhead-container">
          <img 
            src="${letterheadUrl}?t=${Date.now()}" 
            class="letterhead-background" 
            alt="Letterhead"
            onerror="this.style.display='none'; console.log('Letterhead failed to load')"
          />
        </div>
      `
          : ""
      }
      
      <!-- Content Area with 3-inch top margin -->
      <div class="content-container">
        <!-- Header Section -->
        <div class="header-section">
          <div class="bill-to">
            <h3>BILL TO</h3>
            ${
              customer
                ? `
              <div class="customer-name">${customer.company_name || ""}</div>
              ${
                customer.address
                  ? `<div class="customer-detail">${customer.address}</div>`
                  : ""
              }
              ${
                customer.mobile
                  ? `<div class="customer-detail">Phone: ${customer.mobile}</div>`
                  : ""
              }
              ${
                customer.email
                  ? `<div class="customer-detail">Email: ${customer.email}</div>`
                  : ""
              }
            `
                : '<div class="customer-detail">No customer information</div>'
            }
          </div>
          
          <div class="invoice-info">
            <div class="invoice-title">INVOICE</div>
            <div class="invoice-number"># ${invoice.invoice_number}</div>
            <div class="invoice-date">Date: ${dayjs(invoice.issue_date).format(
              "DD/MM/YYYY"
            )}</div>
            <div class="invoice-due">Due Date: ${dayjs(invoice.due_date).format(
              "DD/MM/YYYY"
            )}</div>
          </div>
        </div>
        
        <!-- Items Table -->
        <table class="items-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Rate (PKR)</th>
              <th>Amount (PKR)</th>
            </tr>
          </thead>
          <tbody>
            ${
              invoice.items
                ?.map(
                  (item, index) => `
              <tr>
                <td>${item.description || ""}</td>
                <td>${item.quantity || 0}</td>
                <td>${(item.rate || 0).toLocaleString()}</td>
                <td>${(item.amount || 0).toLocaleString()}</td>
              </tr>
            `
                )
                .join("") ||
              '<tr><td colspan="4" style="text-align: center; padding: 20px; font-size: 11px; color: #999;">No items</td></tr>'
            }
          </tbody>
        </table>
        
        <!-- Totals Section -->
        <div class="totals-section">
          <div class="total-row">
            <span class="total-label">Subtotal:</span>
            <span class="total-value">PKR ${totalAmount.toLocaleString()}</span>
          </div>
          <div class="total-row">
            <span class="total-label">Paid Amount:</span>
            <span class="total-value">PKR ${paidAmount.toLocaleString()}</span>
          </div>
          <div class="balance-due">
            <span class="balance-label">Balance Due:</span>
            <span class="balance-value">PKR ${pendingAmount.toLocaleString()}</span>
          </div>
        </div>
        
        <!-- Notes Section -->
        ${
          invoice.notes || invoice.payment_terms
            ? `
          <div class="notes-section">
            ${
              invoice.notes
                ? `
              <div style="margin-bottom: 12px;">
                <div class="notes-title">Notes</div>
                <div class="notes-content">${invoice.notes}</div>
              </div>
            `
                : ""
            }
            ${
              invoice.payment_terms
                ? `
              <div>
                <div class="notes-title">Payment Terms</div>
                <div class="notes-content">${invoice.payment_terms}</div>
              </div>
            `
                : ""
            }
          </div>
        `
            : ""
        }
        
        <!-- Footer -->
        <div class="footer">
          Generated on ${dayjs().format("DD/MM/YYYY HH:mm")}
        </div>
      </div>
      
      <script>
        // Ensure everything is loaded
        document.addEventListener('DOMContentLoaded', function() {
          // Force a reflow to ensure proper rendering
          document.body.style.overflow = 'hidden';
          
          // Log for debugging
          console.log('JPG Invoice HTML loaded');
          console.log('Content starts at 144px from top (3 inches at 72 DPI)');
        });
      </script>
    </body>
    </html>
  `;
  },

  // Download invoice
  async downloadInvoice(
    invoice: Invoice,
    format: "pdf" | "jpg" = "pdf",
    includeLetterhead: boolean = true
  ): Promise<void> {
    try {
      const result = await this.generateInvoice(
        invoice,
        format,
        includeLetterhead
      );

      const fileName = `Invoice_${invoice.invoice_number}_${dayjs().format(
        "YYYY-MM-DD"
      )}.${format}`;

      if (format === "jpg" && typeof result === "string") {
        // For JPG, result is a data URL
        const link = document.createElement("a");
        link.href = result;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else if (format === "pdf" && result instanceof Blob) {
        // For PDF, result is a Blob
        const url = URL.createObjectURL(result);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Error downloading invoice:", error);
      throw error;
    }
  },

  // Preview invoice
  async previewInvoice(
    invoice: Invoice,
    includeLetterhead: boolean = true
  ): Promise<void> {
    try {
      const result = await this.generateInvoice(
        invoice,
        "pdf",
        includeLetterhead
      );

      if (result instanceof Blob) {
        const url = URL.createObjectURL(result);
        window.open(url, "_blank");

        // Clean up after a while
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 10000);
      }
    } catch (error) {
      console.error("Error previewing invoice:", error);
      throw error;
    }
  },
};
