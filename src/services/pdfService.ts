import jsPDF from "jspdf";
import type { Customer, LedgerEntry } from "../types";
import dayjs from "dayjs";
import { settingsService } from "./databaseService";

export const pdfService = {
  // Generate professional customer ledger PDF
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
    periodLabel?: string
  ): Promise<void> {
    try {
      // Get company settings
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

      // Create PDF document in LANDSCAPE mode
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margin = 10;
      const contentWidth = pageWidth - margin * 2;

      // Colors for professional look
      const primaryColor = [41, 128, 185]; // Blue
      const secondaryColor = [52, 152, 219]; // Light Blue
      const successColor = [39, 174, 96]; // Green
      const dangerColor = [231, 76, 60]; // Red
      const warningColor = [241, 196, 15]; // Yellow
      const grayColor = [149, 165, 166]; // Gray
      const lightGray = [245, 245, 245];

      // Add professional header
      this.addProfessionalHeader(
        doc,
        settings,
        margin,
        primaryColor,
        pageWidth
      );

      // Add report title
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text("CUSTOMER LEDGER STATEMENT", pageWidth / 2, 25, {
        align: "center",
      });

      // Add customer information section
      const customerY = 32;

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text("CUSTOMER INFORMATION", margin, customerY);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);

      // Customer details in compact layout
      doc.text(`Company: ${customer.company_name}`, margin, customerY + 6);

      let nextY = customerY + 12;
      if (customer.first_name || customer.last_name) {
        doc.text(
          `Contact: ${customer.first_name || ""} ${customer.last_name || ""}`,
          margin,
          nextY
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

      // Add period and generation info on right side
      const infoY = customerY;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);

      // Period information
      const periodText = periodLabel || "All Transactions";
      doc.text(`Period: ${periodText}`, pageWidth - margin, infoY, {
        align: "right",
      });

      // Generated date
      doc.text(
        `Generated: ${dayjs().format("DD/MM/YYYY HH:mm")}`,
        pageWidth - margin,
        infoY + 6,
        { align: "right" }
      );

      // If specific dates are provided, show them
      if (summary.periodStart && summary.periodEnd && !periodLabel) {
        const dateRange = `${dayjs(summary.periodStart).format(
          "DD/MM/YYYY"
        )} - ${dayjs(summary.periodEnd).format("DD/MM/YYYY")}`;
        doc.text(dateRange, pageWidth - margin, infoY + 12, { align: "right" });
      }

      // Add summary boxes with more space
      const summaryY = customerY + 35;
      this.addSummaryBoxes(doc, summary, margin, contentWidth, summaryY, {
        primary: primaryColor,
        success: successColor,
        danger: dangerColor,
        warning: warningColor,
      });

      // Prepare table data
      const tableStartY = summaryY + 25;

      // Format entries for table - clean up opening balance description
      const tableData = entries.map((entry, index) => {
        // Format opening balance description
        let description = entry.description || "";
        if (
          entry.type.toLowerCase().includes("opening") ||
          description.toLowerCase().includes("opening") ||
          description.toLowerCase().includes("balance")
        ) {
          // Clean up opening balance description
          const dateMatch = description.match(/\d{2}\/\d{2}\/\d{4}/);
          if (dateMatch) {
            description = `Opening Balance as of ${dateMatch[0]}`;
          } else {
            // Use entry date if no date in description
            description = `Opening Balance as of ${dayjs(entry.date).format(
              "DD/MM/YYYY"
            )}`;
          }
        }

        return [
          (index + 1).toString(),
          dayjs(entry.date).format("DD/MM/YYYY"),
          description,
          entry.debit > 0 ? this.formatCurrencyFull(entry.debit) : "-",
          entry.credit > 0 ? this.formatCurrencyFull(entry.credit) : "-",
          this.formatCurrencyFull(entry.balance),
        ];
      });

      // Define table columns - REMOVED Type column
      const headers = [
        "#",
        "Date",
        "Description",
        "Debit (PKR)",
        "Credit (PKR)",
        "Balance (PKR)",
      ];

      // Fixed column widths for landscape - REMOVED Type column width
      const columnWidths = [10, 25, 120, 40, 40, 42]; // Total: 277mm

      // Draw professional table in landscape
      let currentY = this.drawLandscapeTable(
        doc,
        headers,
        tableData,
        margin,
        tableStartY,
        columnWidths,
        primaryColor,
        pageHeight
      );

      // Add totals row with closing balance
      const totalsY = currentY + 8;
      this.addLandscapeTotalsRow(
        doc,
        entries,
        summary.closingBalance,
        margin,
        totalsY,
        columnWidths,
        primaryColor
      );

      // Add footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);

        // Footer line
        doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setLineWidth(0.5);
        doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);

        // Footer text
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);

        const footerText = `${settings.company_name} | Customer Ledger Statement | Page ${i} of ${pageCount}`;
        doc.text(footerText, pageWidth / 2, pageHeight - 10, {
          align: "center",
        });
      }

      // Save PDF
      const fileName = `Ledger_${customer.company_name.replace(
        /\s+/g,
        "_"
      )}_${dayjs().format("YYYY-MM-DD")}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error("Error generating PDF:", error);
      throw error;
    }
  },

  // Add professional header for landscape
  addProfessionalHeader(
    doc: jsPDF,
    settings: any,
    margin: number,
    primaryColor: number[],
    pageWidth: number
  ): void {
    // Header background
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, pageWidth, 20, "F");

    // Company name
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(
      settings.company_name || "Ahsan Dogar Rubber Works",
      pageWidth / 2,
      12,
      { align: "center" }
    );

    // Decorative line under header
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.line(margin, 18, pageWidth - margin, 18);
  },

  // Add summary boxes for landscape
  addSummaryBoxes(
    doc: jsPDF,
    summary: any,
    margin: number,
    contentWidth: number,
    startY: number,
    colors: any
  ): void {
    const boxWidth = (contentWidth - 15) / 4;
    const boxHeight = 18;
    const spacing = 5;

    // Title
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.text("LEDGER SUMMARY", margin, startY - 3);

    // Define boxes - opening balance should come from summary object
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

    // Draw boxes
    boxes.forEach((box, index) => {
      const x = margin + index * (boxWidth + spacing);
      const y = startY;

      // Box with border
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, boxWidth, boxHeight, 2, 2, "FD");

      // Left accent
      doc.setFillColor(box.color[0], box.color[1], box.color[2]);
      doc.rect(x, y, 4, boxHeight, "F");

      // Title
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 100, 100);

      // Wrap long titles
      const titleLines = doc.splitTextToSize(box.title, boxWidth - 10);
      doc.text(titleLines, x + boxWidth / 2, y + 5, { align: "center" });

      // Value with full amount
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60, 60, 60);
      const formattedValue = this.formatCurrencyFull(box.value);
      const valueY = y + (box.title.includes("BALANCE") ? 12 : 11);
      doc.text(formattedValue, x + boxWidth / 2, valueY, { align: "center" });
    });
  },

  // Draw professional table for landscape with increased font - UPDATED for removed Type column
  drawLandscapeTable(
    doc: jsPDF,
    headers: string[],
    data: any[][],
    startX: number,
    startY: number,
    columnWidths: number[],
    primaryColor: number[],
    pageHeight: number
  ): number {
    const rowHeight = 9;
    const headerHeight = 11;
    let currentY = startY;
    const totalWidth = columnWidths.reduce((sum, w) => sum + w, 0);

    // Draw main table border
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.rect(startX, startY, totalWidth, pageHeight - startY - 25);

    // Draw header background
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(startX, startY, totalWidth, headerHeight, "F");

    // Draw header text
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);

    let xPos = startX;
    headers.forEach((header, index) => {
      const cellWidth = columnWidths[index];
      const isNumeric = index >= 3; // Debit, Credit, Balance columns
      const align = isNumeric
        ? "right"
        : index === 0 || index === 1
        ? "center"
        : "left";
      const padding = 5;

      let textX = xPos + padding;
      if (isNumeric) {
        textX = xPos + cellWidth - padding;
      } else if (index === 0 || index === 1) {
        textX = xPos + cellWidth / 2;
      }

      const headerText = doc.splitTextToSize(header, cellWidth - padding * 2);
      doc.text(headerText, textX, startY + 7, { align: align as any });

      // DRAW VERTICAL LINES BETWEEN HEADER COLUMNS
      if (index < headers.length - 1) {
        doc.setDrawColor(230, 230, 230); // Light gray for vertical lines
        doc.setLineWidth(0.1);
        const lineX = xPos + cellWidth;
        doc.line(lineX, startY, lineX, startY + headerHeight);
      }

      xPos += cellWidth;
    });

    currentY += headerHeight;

    // Draw horizontal line after header
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.line(startX, currentY, startX + totalWidth, currentY);

    // Draw data rows
    data.forEach((row, rowIndex) => {
      // Check if we need a new page
      if (currentY + rowHeight > pageHeight - 25) {
        doc.addPage();
        currentY = 15;

        // Redraw table border and header on new page
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(startX, currentY, totalWidth, pageHeight - currentY - 25);

        // Draw header on new page
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(startX, currentY, totalWidth, headerHeight, "F");

        xPos = startX;
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);

        headers.forEach((header, index) => {
          const cellWidth = columnWidths[index];
          const isNumeric = index >= 3;
          const align = isNumeric
            ? "right"
            : index === 0 || index === 1
            ? "center"
            : "left";
          const padding = 5;

          let textX = xPos + padding;
          if (isNumeric) {
            textX = xPos + cellWidth - padding;
          } else if (index === 0 || index === 1) {
            textX = xPos + cellWidth / 2;
          }

          const headerText = doc.splitTextToSize(
            header,
            cellWidth - padding * 2
          );
          doc.text(headerText, textX, currentY + 7, { align: align as any });

          // DRAW VERTICAL LINES BETWEEN HEADER COLUMNS ON NEW PAGE
          if (index < headers.length - 1) {
            doc.setDrawColor(230, 230, 230);
            doc.setLineWidth(0.1);
            const lineX = xPos + cellWidth;
            doc.line(lineX, currentY, lineX, currentY + headerHeight);
          }

          xPos += cellWidth;
        });

        currentY += headerHeight;

        // Draw horizontal line after header
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.5);
        doc.line(startX, currentY, startX + totalWidth, currentY);
      }

      // Alternate row background
      if (rowIndex % 2 === 0) {
        doc.setFillColor(248, 248, 248);
      } else {
        doc.setFillColor(255, 255, 255);
      }

      doc.rect(startX, currentY, totalWidth, rowHeight, "F");

      // Draw row content
      xPos = startX;
      row.forEach((cell, colIndex) => {
        const cellWidth = columnWidths[colIndex];
        const isNumeric = colIndex >= 3;
        const align = isNumeric
          ? "right"
          : colIndex === 0 || colIndex === 1
          ? "center"
          : "left";
        const padding = 5;

        let textX = xPos + padding;
        if (isNumeric) {
          textX = xPos + cellWidth - padding;
        } else if (colIndex === 0 || colIndex === 1) {
          textX = xPos + cellWidth / 2;
        }

        // Set font style and color
        doc.setFontSize(9);
        if (isNumeric && cell !== "-") {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(60, 60, 60);
        } else if (colIndex === 0 || colIndex === 1) {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 100, 100);
        } else {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(60, 60, 60);
        }

        // Process cell content
        let displayText = cell.toString();
        if (colIndex === 2 && displayText.length > 70) {
          displayText = displayText.substring(0, 70) + "...";
        }

        const textLines = doc.splitTextToSize(
          displayText,
          cellWidth - padding * 2
        );

        if (textLines.length > 0) {
          doc.text(textLines[0], textX, currentY + 6, {
            align: align as any,
            maxWidth: cellWidth - padding * 2,
          });
        }

        // DRAW VERTICAL LINES BETWEEN COLUMNS IN DATA ROWS
        if (colIndex < row.length - 1) {
          doc.setDrawColor(169, 169, 169); // Light gray for vertical lines
          doc.setLineWidth(0.1);
          const lineX = xPos + cellWidth;
          doc.line(lineX, currentY, lineX, currentY + rowHeight);
        }

        xPos += cellWidth;
      });

      // Draw horizontal line between rows
      doc.setDrawColor(169, 169, 169); // Slightly darker gray for horizontal lines
      doc.setLineWidth(0.3);
      doc.line(
        startX,
        currentY + rowHeight,
        startX + totalWidth,
        currentY + rowHeight
      );

      currentY += rowHeight;
    });

    return currentY;
  },

  // Add totals row for landscape with closing balance - UPDATED for removed Type column
  addLandscapeTotalsRow(
    doc: jsPDF,
    entries: LedgerEntry[],
    closingBalance: number,
    startX: number,
    startY: number,
    columnWidths: number[],
    primaryColor: number[]
  ): void {
    const totalDebits = entries.reduce((sum, entry) => sum + entry.debit, 0);
    const totalCredits = entries.reduce((sum, entry) => sum + entry.credit, 0);
    const rowHeight = 10;
    const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);

    // Draw totals row background
    doc.setFillColor(240, 240, 240);
    doc.rect(startX, startY, totalWidth, rowHeight, "F");

    // Draw totals row border
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.rect(startX, startY, totalWidth, rowHeight, "D");

    // Calculate column positions - UPDATED for removed Type column
    let xPos = startX;

    // Skip first 2 columns (#, Date) for "TOTALS" label (removed Type column)
    xPos += columnWidths[0] + columnWidths[1];

    // Draw "TOTALS" label in Description column
    doc.setFontSize(10); // Increased font size
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text("TOTALS", xPos + 10, startY + 6.5, { align: "left" });

    // Move to Debit column (skip Description column)
    xPos += columnWidths[2];

    // Draw total debits
    const debitText = this.formatCurrencyFull(totalDebits);
    doc.text(debitText, xPos + columnWidths[3] - 5, startY + 6.5, {
      align: "right",
    });

    // Draw total credits
    xPos += columnWidths[3];
    const creditText = this.formatCurrencyFull(totalCredits);
    doc.text(creditText, xPos + columnWidths[4] - 5, startY + 6.5, {
      align: "right",
    });

    // Draw final balance
    xPos += columnWidths[4];
    const balanceText = this.formatCurrencyFull(closingBalance);

    // Highlight final balance with different background
    doc.setFillColor(220, 220, 220);
    doc.rect(xPos, startY, columnWidths[5], rowHeight, "F");
    doc.setDrawColor(180, 180, 180);
    doc.rect(xPos, startY, columnWidths[5], rowHeight, "D");

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(balanceText, xPos + columnWidths[5] - 5, startY + 6.5, {
      align: "right",
    });
  },

  // Helper to format currency with full amount (no abbreviations)
  formatCurrencyFull(amount: number): string {
    if (amount === 0) return "PKR 0.00";

    const isNegative = amount < 0;
    const absAmount = Math.abs(amount);

    // Format with commas for thousands and 2 decimal places
    const formatted = absAmount.toLocaleString("en-PK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return `PKR ${formatted}${isNegative ? " CR" : ""}`;
  },

  // Generate PDF and download
  async downloadCustomerLedgerPDF(
    customer: Customer,
    entries: LedgerEntry[],
    summary: any,
    periodLabel?: string
  ): Promise<void> {
    await this.generateProfessionalLedgerPDF(
      customer,
      entries,
      summary,
      periodLabel
    );
  },

  // Generate PDF and open in new window
  async openCustomerLedgerPDF(
    customer: Customer,
    entries: LedgerEntry[],
    summary: any,
    periodLabel?: string
  ): Promise<void> {
    await this.downloadCustomerLedgerPDF(
      customer,
      entries,
      summary,
      periodLabel
    );
  },
};
