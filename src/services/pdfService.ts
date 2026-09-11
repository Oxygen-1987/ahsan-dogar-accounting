import jsPDF from "jspdf";
import type { Customer, LedgerEntry } from "../types";
import dayjs from "dayjs";
import { settingsService } from "./databaseService";

export const pdfService = {
  async generateProfessionalLedgerPDF(
    customer: Customer,
    entries: LedgerEntry[],
    summary: {
      openingBalance: number;
      closingBalance: number;
      totalDebits: number;
      totalCredits: number;
      periodStart?: string;
      periodEnd?: string;
    },
    periodLabel?: string,
  ): Promise<void> {
    try {
      let settings;
      try {
        settings = await settingsService.getCompanySettings();
      } catch (error) {
        console.warn("Using default settings:", error);
        settings = {
          id: "default",
          company_name: "Ahsan Dogar Rubber Works",
          currency: "PKR",
          date_format: "DD/MM/YYYY",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }

      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margin = 10;
      const contentWidth = pageWidth - margin * 2;

      const primaryColor = [41, 128, 185];
      const secondaryColor = [52, 152, 219];
      const successColor = [39, 174, 96];
      const dangerColor = [231, 76, 60];
      const warningColor = [241, 196, 15];
      const grayColor = [149, 165, 166];
      const lightGray = [245, 245, 245];

      this.addProfessionalHeader(
        doc,
        settings,
        margin,
        primaryColor,
        pageWidth,
      );

      // Title
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text("CUSTOMER LEDGER STATEMENT", pageWidth / 2, 25, {
        align: "center",
      });

      // Customer info
      const customerY = 32;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text("CUSTOMER INFORMATION", margin, customerY);

      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      doc.text(`Company: ${customer.company_name}`, margin, customerY + 6);

      let nextY = customerY + 12;
      if (customer.first_name || customer.last_name) {
        doc.text(
          `Contact: ${customer.first_name || ""} ${customer.last_name || ""}`,
          margin,
          nextY,
        );
        nextY += 6;
      }
      if (customer.mobile) {
        doc.text(`Mobile: ${customer.mobile}`, margin, nextY);
        nextY += 6;
      }
      if (customer.address) {
        const shortAddress =
          customer.address.length > 60
            ? customer.address.substring(0, 60) + "..."
            : customer.address;
        doc.text(`Address: ${shortAddress}`, margin, nextY);
      }

      const infoY = customerY;
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);

      const periodText = periodLabel || "All Transactions";
      doc.text(`Period: ${periodText}`, pageWidth - margin, infoY, {
        align: "right",
      });
      doc.text(
        `Generated: ${dayjs().format("DD/MM/YYYY HH:mm")}`,
        pageWidth - margin,
        infoY + 6,
        { align: "right" },
      );
      if (summary.periodStart && summary.periodEnd && !periodLabel) {
        const dateRange = `${dayjs(summary.periodStart).format(
          "DD/MM/YYYY",
        )} - ${dayjs(summary.periodEnd).format("DD/MM/YYYY")}`;
        doc.text(dateRange, pageWidth - margin, infoY + 12, { align: "right" });
      }

      // Summary boxes
      const summaryY = customerY + 35;
      this.addSummaryBoxes(doc, summary, margin, contentWidth, summaryY, {
        primary: primaryColor,
        success: successColor,
        danger: dangerColor,
        warning: warningColor,
      });

      const tableStartY = summaryY + 25;

      // Build table rows
      const tableData = entries.map((entry) => {
        let description = "";
        let invoiceNumberCol = "";
        let sizeCol = "";
        let rateCol = "";
        let qtyCol = "";

        switch (entry.type) {
          case "opening_balance":
            description = "Opening Balance";
            break;

          case "invoice": {
            const invoiceNumber =
              entry.reference_number ||
              (entry.description?.match(/INV-\d+-\d+/) || [])[0] ||
              "";
            invoiceNumberCol = invoiceNumber || "-";

            const legacyPrefix = invoiceNumber
              ? `Invoice ${invoiceNumber}`
              : "";
            const desc = (entry.description || "").trim();
            if (desc && desc !== legacyPrefix) {
              description = desc;
            } else if (invoiceNumber) {
              description = invoiceNumber;
            } else {
              description = "Invoice";
            }

            // Size / Rate / Qty come from the expanded line-item entry
            if (entry.invoice_size != null && entry.invoice_size > 0) {
              sizeCol = entry.invoice_size.toLocaleString();
            } else {
              sizeCol = "-";
            }
            if (entry.invoice_rate != null && entry.invoice_rate > 0) {
              rateCol = entry.invoice_rate.toLocaleString();
            } else {
              rateCol = "-";
            }
            if (entry.invoice_quantity != null && entry.invoice_quantity > 0) {
              qtyCol = entry.invoice_quantity.toLocaleString();
            } else {
              qtyCol = "-";
            }
            break;
          }

          case "payment": {
            const paymentNumber =
              entry.reference_number ||
              (entry.description?.match(/PAY-\d+-\d+/) || [])[0] ||
              "Payment";
            description = `Payment ${paymentNumber}`;
            break;
          }

          case "discount": {
            const discountDescription = entry.description || "";
            if (discountDescription.startsWith("Discount: ")) {
              const reason = discountDescription.substring(10);
              const invoiceMatch = reason.match(/Invoice: ([A-Z0-9-]+)/i);
              if (invoiceMatch) {
                description = `Discount (Invoice: ${invoiceMatch[1]})`;
              } else {
                description = reason;
              }
            } else if (discountDescription.startsWith("Discount")) {
              description = discountDescription;
            } else {
              const discountInvoiceMatch = entry.description?.match(
                /invoice\s+([A-Z0-9-]+)/i,
              );
              const discountInvoice = discountInvoiceMatch
                ? discountInvoiceMatch[1]
                : "Invoice";
              description = `Discount on ${discountInvoice}`;
            }
            break;
          }

          default:
            description = entry.description || "";
            if (description.includes("PKR") && description.includes("to")) {
              description = description.split("PKR")[0].trim();
            }
            if (description.includes("(")) {
              description = description.split("(")[0].trim();
            }
            break;
        }

        return [
          "", // #
          dayjs(entry.date).format("DD/MM/YYYY"), // Date
          invoiceNumberCol, // Invoice #
          description, // Description
          sizeCol, // Size
          rateCol, // Rate
          qtyCol, // Qty
          entry.debit > 0 ? this.formatCurrencyFull(entry.debit, false) : "-",
          entry.credit > 0 ? this.formatCurrencyFull(entry.credit, false) : "-",
          this.formatCurrencyFull(entry.balance, true),
        ];
      });

      const headers = [
        "#",
        "Date",
        "Invoice #",
        "Description",
        "Size",
        "Rate",
        "Qty",
        "Debit",
        "Credit",
        "Balance",
      ];

      const availableWidth = pageWidth - margin * 2;

      const maxSerialNumber = entries.length;
      const serialNumberDigits = maxSerialNumber.toString().length;
      const serialColWidth = Math.max(18, serialNumberDigits * 6 + 6);

      // Numeric-friendly widths
      const dateColW = 26;
      const invoiceColW = 32;
      const sizeColW = 20;
      const rateColW = 22;
      const qtyColW = 16;
      const debitColW = 32;
      const creditColW = 32;
      const balanceColW = 36;

      const descriptionColW =
        availableWidth -
        (serialColWidth +
          dateColW +
          invoiceColW +
          sizeColW +
          rateColW +
          qtyColW +
          debitColW +
          creditColW +
          balanceColW);

      const columnWidths = [
        serialColWidth,
        dateColW,
        invoiceColW,
        descriptionColW,
        sizeColW,
        rateColW,
        qtyColW,
        debitColW,
        creditColW,
        balanceColW,
      ];

      const currentY = this.drawLandscapeTable(
        doc,
        headers,
        tableData,
        margin,
        tableStartY,
        columnWidths,
        primaryColor,
        pageHeight,
      );

      const totalsY = currentY + 8;
      this.addLandscapeTotalsRow(
        doc,
        entries,
        summary.closingBalance,
        margin,
        totalsY,
        columnWidths,
        primaryColor,
      );

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setLineWidth(0.5);
        doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        const footerText = `${settings.company_name} | Customer Ledger Statement | Page ${i} of ${pageCount}`;
        doc.text(footerText, pageWidth / 2, pageHeight - 10, {
          align: "center",
        });
      }

      const fileName = `Ledger_${customer.company_name.replace(
        /\s+/g,
        "_",
      )}_${dayjs().format("YYYY-MM-DD")}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error("Error generating PDF:", error);
      throw error;
    }
  },

  addProfessionalHeader(
    doc: jsPDF,
    settings: any,
    margin: number,
    primaryColor: number[],
    pageWidth: number,
  ): void {
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, pageWidth, 20, "F");

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(
      settings.company_name || "Ahsan Dogar Rubber Works",
      pageWidth / 2,
      12,
      { align: "center" },
    );

    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.line(margin, 18, pageWidth - margin, 18);
  },

  addSummaryBoxes(
    doc: jsPDF,
    summary: any,
    margin: number,
    contentWidth: number,
    startY: number,
    colors: any,
  ): void {
    const boxWidth = (contentWidth - 15) / 4;
    const boxHeight = 20;
    const spacing = 5;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.text("LEDGER SUMMARY", margin, startY - 3);

    const boxes = [
      {
        title: "OPENING BALANCE",
        value: summary.openingBalance,
        color: colors.warning,
      },
      {
        title: "TOTAL DEBITS",
        value: summary.totalDebits,
        color: colors.danger,
      },
      {
        title: "TOTAL CREDITS",
        value: summary.totalCredits,
        color: colors.success,
      },
      {
        title: "CLOSING BALANCE",
        value: summary.closingBalance,
        color: summary.closingBalance >= 0 ? colors.success : colors.danger,
      },
    ];

    boxes.forEach((box, index) => {
      const x = margin + index * (boxWidth + spacing);
      const y = startY;

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, boxWidth, boxHeight, 2, 2, "FD");

      doc.setFillColor(box.color[0], box.color[1], box.color[2]);
      doc.rect(x, y, 4, boxHeight, "F");

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 100, 100);
      const titleLines = doc.splitTextToSize(box.title, boxWidth - 10);
      doc.text(titleLines, x + boxWidth / 2, y + 6, { align: "center" });

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60, 60, 60);
      const formattedValue = this.formatCurrencyFull(box.value, true);
      const valueY = y + (box.title.includes("BALANCE") ? 14 : 13);
      doc.text(formattedValue, x + boxWidth / 2, valueY, { align: "center" });
    });
  },

  drawLandscapeTable(
    doc: jsPDF,
    headers: string[],
    data: any[][],
    startX: number,
    startY: number,
    columnWidths: number[],
    primaryColor: number[],
    pageHeight: number,
  ): number {
    const rowHeight = 9;
    const headerHeight = 12;
    let currentY = startY;
    const totalWidth = columnWidths.reduce((sum, w) => sum + w, 0);

    let globalSerialNumber = 0;

    // Helper: numeric columns are indices 4..9 (Size, Rate, Qty, Debit, Credit, Balance)
    // Centered columns are 0, 1, 2 (#, Date, Invoice #)
    const isNumericCol = (i: number) => i >= 4;
    const isCenteredCol = (i: number) => i === 0 || i === 1 || i === 2;

    const drawHeaderRow = (y: number) => {
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.rect(startX, y, totalWidth, headerHeight, "F");
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(startX, y, totalWidth, headerHeight, "F");

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);

      let xp = startX;
      headers.forEach((header, index) => {
        const cw = columnWidths[index];
        const align = isNumericCol(index)
          ? "right"
          : isCenteredCol(index)
            ? "center"
            : "left";
        const padding = 3;

        let tx = xp + padding;
        if (isNumericCol(index)) tx = xp + cw - padding;
        else if (isCenteredCol(index)) tx = xp + cw / 2;

        const lines = doc.splitTextToSize(header, cw - padding * 2);
        doc.text(lines, tx, y + 8, { align: align as any });

        if (index < headers.length - 1) {
          doc.setDrawColor(230, 230, 230);
          doc.setLineWidth(0.1);
          const lineX = xp + cw;
          doc.line(lineX, y, lineX, y + headerHeight);
        }
        xp += cw;
      });
    };

    // Table outer border
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.rect(startX, startY, totalWidth, pageHeight - startY - 25);

    // Header
    drawHeaderRow(startY);
    currentY = startY + headerHeight;

    // Data rows
    for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
      if (currentY + rowHeight > pageHeight - 25) {
        doc.addPage();
        currentY = 15;

        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(startX, currentY, totalWidth, pageHeight - currentY - 25);

        drawHeaderRow(currentY);
        currentY += headerHeight;
      }

      globalSerialNumber++;
      const row = [...data[rowIndex]];
      row[0] = globalSerialNumber.toString();

      if (rowIndex % 2 === 0) doc.setFillColor(248, 248, 248);
      else doc.setFillColor(255, 255, 255);
      doc.rect(startX, currentY, totalWidth, rowHeight, "F");

      let xp = startX;
      row.forEach((cell, colIndex) => {
        const cw = columnWidths[colIndex];
        const align = isNumericCol(colIndex)
          ? "right"
          : isCenteredCol(colIndex)
            ? "center"
            : "left";

        const padding = colIndex === 0 ? 2 : 3;
        let tx = xp + padding;
        if (isNumericCol(colIndex)) tx = xp + cw - padding;
        else if (isCenteredCol(colIndex)) tx = xp + cw / 2;

        doc.setFontSize(9);

        // Colors
        if (colIndex === 0) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(100, 100, 100);
        } else if (colIndex === 1) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(100, 100, 100);
        } else if (colIndex === 2) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(155, 89, 182);
        } else if (colIndex === 3) {
          if (typeof cell === "string") {
            const cl = cell.toLowerCase();
            if (cl.startsWith("payment")) {
              doc.setFont("helvetica", "bold");
              doc.setTextColor(39, 174, 96);
            } else if (cl.startsWith("discount")) {
              doc.setFont("helvetica", "bold");
              doc.setTextColor(241, 196, 15);
            } else if (cl.includes("opening balance")) {
              doc.setFont("helvetica", "bold");
              doc.setTextColor(52, 152, 219);
            } else if (/INV-\d+-\d+/i.test(cell)) {
              doc.setFont("helvetica", "bold");
              doc.setTextColor(155, 89, 182);
            } else {
              doc.setFont("helvetica", "normal");
              doc.setTextColor(60, 60, 60);
            }
          }
        } else if (colIndex === 4 || colIndex === 5 || colIndex === 6) {
          // Size, Rate, Qty - neutral gray
          doc.setFont("helvetica", "normal");
          doc.setTextColor(80, 80, 80);
        } else if (colIndex === 7) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(231, 76, 60);
        } else if (colIndex === 8) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(39, 174, 96);
        } else if (colIndex === 9) {
          doc.setFont("helvetica", "bold");
          const balVal = row[9];
          const isNeg =
            typeof balVal === "string" ? balVal.includes("CR") : false;
          doc.setTextColor(isNeg ? 231 : 39, isNeg ? 76 : 174, isNeg ? 60 : 96);
        }

        let displayText = cell.toString();
        if (colIndex === 3 && displayText.length > 42) {
          displayText = displayText.substring(0, 42) + "...";
        }

        const lines = doc.splitTextToSize(displayText, cw - padding * 2);
        if (lines.length > 0) {
          doc.text(lines[0], tx, currentY + 6, {
            align: align as any,
            maxWidth: cw - padding * 2,
          });
        }

        if (colIndex < row.length - 1) {
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.1);
          const lineX = xp + cw;
          doc.line(lineX, currentY, lineX, currentY + rowHeight);
        }

        xp += cw;
      });

      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      doc.line(
        startX,
        currentY + rowHeight,
        startX + totalWidth,
        currentY + rowHeight,
      );

      currentY += rowHeight;
    }

    return currentY;
  },

  addLandscapeTotalsRow(
    doc: jsPDF,
    entries: LedgerEntry[],
    closingBalance: number,
    startX: number,
    startY: number,
    columnWidths: number[],
    primaryColor: number[],
  ): void {
    const totalDebits = entries.reduce((sum, e) => sum + (e.debit || 0), 0);
    const totalCredits = entries.reduce((sum, e) => sum + (e.credit || 0), 0);
    const rowHeight = 11;
    const totalWidth = columnWidths.reduce((sum, w) => sum + w, 0);

    doc.setFillColor(240, 240, 240);
    doc.rect(startX, startY, totalWidth, rowHeight, "F");
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.rect(startX, startY, totalWidth, rowHeight, "D");

    // Skip #, Date, Invoice # (cols 0,1,2) — "TOTALS" label goes in Description (col 3)
    let xp = startX + columnWidths[0] + columnWidths[1] + columnWidths[2];

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text("TOTALS", xp + 4, startY + 7, { align: "left" });

    // Skip Description, Size, Rate, Qty (cols 3,4,5,6)
    xp += columnWidths[3] + columnWidths[4] + columnWidths[5] + columnWidths[6];

    // Debit (col 7)
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(231, 76, 60);
    doc.text(
      this.formatCurrencyFull(totalDebits, false),
      xp + columnWidths[7] - 5,
      startY + 7,
      { align: "right" },
    );

    // Credit (col 8)
    xp += columnWidths[7];
    doc.setFont("helvetica", "bold");
    doc.setTextColor(39, 174, 96);
    doc.text(
      this.formatCurrencyFull(totalCredits, false),
      xp + columnWidths[8] - 5,
      startY + 7,
      { align: "right" },
    );

    // Balance (col 9)
    xp += columnWidths[8];
    doc.setFillColor(220, 220, 220);
    doc.rect(xp, startY, columnWidths[9], rowHeight, "F");
    doc.setDrawColor(180, 180, 180);
    doc.rect(xp, startY, columnWidths[9], rowHeight, "D");

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(
      this.formatCurrencyFull(closingBalance, true),
      xp + columnWidths[9] - 5,
      startY + 7,
      { align: "right" },
    );
  },

  formatCurrencyFull(amount: number, includePKR: boolean = true): string {
    if (amount === 0) return includePKR ? "PKR 0" : "0";
    const isNegative = amount < 0;
    const absAmount = Math.abs(amount);
    const formatted = absAmount.toLocaleString("en-PK", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    return `${includePKR ? "PKR " : ""}${formatted}${isNegative ? " CR" : ""}`;
  },

  async downloadCustomerLedgerPDF(
    customer: Customer,
    entries: LedgerEntry[],
    summary: any,
    periodLabel?: string,
  ): Promise<void> {
    await this.generateProfessionalLedgerPDF(
      customer,
      entries,
      summary,
      periodLabel,
    );
  },

  async openCustomerLedgerPDF(
    customer: Customer,
    entries: LedgerEntry[],
    summary: any,
    periodLabel?: string,
  ): Promise<void> {
    await this.downloadCustomerLedgerPDF(
      customer,
      entries,
      summary,
      periodLabel,
    );
  },
};
