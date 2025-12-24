// src/services/reportPdfService.ts - COMPLETE VERSION
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import dayjs from "dayjs";

export const reportPdfService = {
  // Generate Parties Balances PDF
  async generatePartiesBalancesPDF(
    data: any[],
    totals: any,
    cityFilter: string = "all",
    asOfDate?: string
  ): Promise<void> {
    // Use LANDSCAPE mode
    const doc = new jsPDF("landscape");
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 15;

    // Title - Increased font size
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("PARTIES BALANCES REPORT", pageWidth / 2, 20, { align: "center" });

    // As on Date - Center aligned with increased font
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");

    const reportDate = asOfDate
      ? dayjs(asOfDate).format("DD/MM/YYYY")
      : dayjs().format("DD/MM/YYYY");

    doc.text(`As on: ${reportDate}`, pageWidth / 2, 30, { align: "center" });

    // Generated timestamp - Moved below "As on"
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Generated: ${dayjs().format("DD/MM/YYYY HH:mm")}`,
      pageWidth / 2,
      37,
      { align: "center" }
    );

    // Quick summary line above table
    const summaryY = 44;
    doc.setFontSize(12); // Increased font size
    doc.setFont("helvetica", "bold");

    const summaryText = `Showing ${
      data.length
    } parties | Debit: ${this.formatCurrency(
      totals.totalDebit,
      false
    )} | Credit: ${this.formatCurrency(
      totals.totalCredit,
      false
    )} | Balance: ${this.formatCurrency(totals.currentBalance, true)}`;
    doc.text(summaryText, pageWidth / 2, summaryY, { align: "center" });

    // Prepare table data
    const tableData = data.map((item, index) => [
      (index + 1).toString(),
      item.customer?.company_name?.substring(0, 25) || "-",
      // Current Balance
      item.currentBalance < 0
        ? `${Math.abs(item.currentBalance).toLocaleString()} CR`
        : this.formatCurrency(item.currentBalance || 0, false),
      this.formatCurrency(item.totalDebit || 0, false),
      this.formatCurrency(item.totalCredit || 0, false),
      // Last Payment Date
      item.lastPayment?.date
        ? dayjs(item.lastPayment.date).format("DD/MM/YY")
        : "-",
      // Last Payment Amount
      item.lastPayment?.amount
        ? this.formatCurrency(item.lastPayment.amount, false)
        : "-",
      // Last Invoice Date
      item.lastInvoice?.date
        ? dayjs(item.lastInvoice.date).format("DD/MM/YY")
        : "-",
      // Last Invoice Amount
      item.lastInvoice?.amount
        ? this.formatCurrency(item.lastInvoice.amount, false)
        : "-",
    ]);

    // Two-row header structure
    const headers = [
      [
        {
          content: "#",
          rowSpan: 2,
          styles: {
            halign: "center",
            valign: "middle",
            fontStyle: "bold",
          },
        },
        {
          content: "Party Name",
          rowSpan: 2,
          styles: {
            halign: "center",
            valign: "middle",
            fontStyle: "bold",
          },
        },
        {
          content: "Current Balance",
          rowSpan: 2,
          styles: {
            halign: "center",
            valign: "middle",
            fontStyle: "bold",
          },
        },
        {
          content: "Total Debit",
          rowSpan: 2,
          styles: {
            halign: "center",
            valign: "middle",
            fontStyle: "bold",
          },
        },
        {
          content: "Total Credit",
          rowSpan: 2,
          styles: {
            halign: "center",
            valign: "middle",
            fontStyle: "bold",
          },
        },
        {
          content: "Last Payment",
          colSpan: 2,
          styles: {
            halign: "center",
            valign: "middle",
            fontStyle: "bold",
          },
        },
        {
          content: "Last Bill/Invoice",
          colSpan: 2,
          styles: {
            halign: "center",
            valign: "middle",
            fontStyle: "bold",
          },
        },
      ],
      ["Date", "Amount", "Date", "Amount"],
    ];

    // Generate table
    autoTable(doc, {
      head: headers,
      body: tableData,
      startY: summaryY + 12,
      margin: { left: margin, right: margin },
      theme: "grid",
      styles: {
        fontSize: 11, // Increased font size
        cellPadding: 4,
        overflow: "linebreak",
        lineColor: [200, 200, 200],
        lineWidth: 0.2,
        valign: "middle",
        fontStyle: "bold", // Bold all table text
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 12, // Increased font size
        halign: "center",
        valign: "middle",
        lineColor: [41, 128, 185],
        lineWidth: 0.5,
      },
      alternateRowStyles: {
        fillColor: [248, 248, 248],
      },
      bodyStyles: {
        fontSize: 11, // Increased font size
        valign: "middle",
        lineColor: [200, 200, 200],
        lineWidth: 0.2,
        fontStyle: "bold", // Bold body text
      },
      // Column widths - adjusted for better spacing
      columnStyles: {
        0: { cellWidth: 15, halign: "center", fontStyle: "bold", fontSize: 11 },
        1: { cellWidth: 50, halign: "left", fontStyle: "bold", fontSize: 11 },
        2: { cellWidth: 35, halign: "right", fontStyle: "bold", fontSize: 11 },
        3: { cellWidth: 30, halign: "right", fontStyle: "bold", fontSize: 11 },
        4: { cellWidth: 30, halign: "right", fontStyle: "bold", fontSize: 11 },
        5: { cellWidth: 22, halign: "center", fontStyle: "bold", fontSize: 9 }, // Reduced font size for dates
        6: { cellWidth: 30, halign: "right", fontStyle: "bold", fontSize: 11 },
        7: { cellWidth: 22, halign: "center", fontStyle: "bold", fontSize: 9 }, // Reduced font size for dates
        8: { cellWidth: 30, halign: "right", fontStyle: "bold", fontSize: 11 },
      },
      tableWidth: "auto",
      didDrawPage: (data) => {
        // Footer with page number
        doc.setFontSize(9); // Increased font size
        doc.setTextColor(100, 100, 100);
        doc.text(
          `Page ${data.pageNumber}`,
          pageWidth - margin,
          pageHeight - 10,
          { align: "right" }
        );
      },
      willDrawCell: (data) => {
        // Color coding for Current Balance
        if (data.section === "body" && data.column.index === 2) {
          const cellValue = data.cell.raw;
          const match = cellValue.match(/([\d,]+)/);
          if (match) {
            const amount = parseFloat(match[1].replace(/,/g, ""));
            const isCR = cellValue.includes("CR");
            if (isCR) {
              data.cell.styles.textColor = [56, 158, 13]; // Green for negative (credit)
              data.cell.styles.fontStyle = "bold";
            } else if (amount > 0) {
              data.cell.styles.textColor = [207, 19, 34]; // Red for positive (debit)
              data.cell.styles.fontStyle = "bold";
            }
          }
        }

        // Make all numeric columns bold
        if (
          data.section === "body" &&
          [2, 3, 4, 6, 8].includes(data.column.index)
        ) {
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    // Save PDF
    const fileName = `Parties_Balances_${
      cityFilter !== "all" ? cityFilter + "_" : ""
    }${dayjs().format("YYYY-MM-DD")}.pdf`;
    doc.save(fileName);
  },

  // Generate Payments Details PDF
  async generatePaymentsDetailsPDF(
    data: any[],
    totals: any,
    filters: any = {}
  ): Promise<void> {
    const doc = new jsPDF("landscape");
    const pageWidth = doc.internal.pageSize.width;
    const margin = 15;

    // Title
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("PAYMENTS DETAILS REPORT", pageWidth / 2, 20, { align: "center" });

    // Subtitle with highlight
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");

    const subtitleText = "Payment Allocations and Summaries";
    const subtitleWidth = doc.getTextWidth(subtitleText);
    const subtitleX = (pageWidth - subtitleWidth) / 2;

    // Draw highlight background for subtitle
    doc.setFillColor(52, 152, 219); // Different blue for variety
    doc.roundedRect(subtitleX - 8, 28, subtitleWidth + 16, 10, 3, 3, "F");

    // Draw subtitle text
    doc.setTextColor(255, 255, 255);
    doc.text(subtitleText, pageWidth / 2, 34, { align: "center" });

    // Reset text color
    doc.setTextColor(0, 0, 0);

    // Filters info
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    let filterText = "All Payments";
    if (filters.method && filters.method !== "all") {
      filterText += ` • Method: ${filters.method}`;
    }
    if (filters.status && filters.status !== "all") {
      filterText += ` • Status: ${filters.status}`;
    }
    if (filters.dateRange) {
      filterText += ` • Date: ${filters.dateRange}`;
    }

    doc.text(filterText, margin, 45);
    doc.text(
      `Generated: ${dayjs().format("DD/MM/YYYY HH:mm")}`,
      pageWidth - margin,
      45,
      { align: "right" }
    );

    // Prepare table data
    const tableData = data.map((item, index) => {
      const payment = item.payment;
      return [
        (index + 1).toString(),
        payment.payment_number,
        dayjs(payment.payment_date).format("DD/MM/YY"),
        payment.customer?.company_name?.substring(0, 25) || "-",
        payment.reference_number?.substring(0, 15) || "-",
        this.formatCurrency(payment.total_received || 0, false),
        this.formatCurrency(item.totalAllocated || 0, false),
        this.formatCurrency(item.remainingAmount || 0, false),
        item.allocationCount?.toString() || "0",
        payment.payment_method?.toUpperCase() || "-",
        payment.status?.toUpperCase() || "-",
      ];
    });

    // Table headers
    const headers = [
      "#",
      "Payment No",
      "Date",
      "Customer",
      "Reference",
      "Total Received",
      "Allocated",
      "Remaining",
      "Allocations",
      "Method",
      "Status",
    ];

    // Generate table WITHOUT summary row
    autoTable(doc, {
      head: headers,
      body: tableData,
      startY: summaryY + 8,
      margin: { left: margin, right: margin },
      theme: "grid",
      tableWidth: "wrap", // Add this line to wrap table width
      styles: {
        fontSize: 10, // Increased font size
        cellPadding: 4,
        overflow: "linebreak",
        lineColor: [200, 200, 200],
        lineWidth: 0.2,
        valign: "middle",
        fontStyle: "bold", // Bold all table text
      },
      headStyles: {
        fillColor: [52, 152, 219], // Different blue for variety
        textColor: 255,
        fontStyle: "bold",
        fontSize: 10,
        halign: "center",
        valign: "middle",
        lineColor: [52, 152, 219], // Seamless header
        lineWidth: 0.5,
      },
      alternateRowStyles: {
        fillColor: [248, 248, 248],
      },
      bodyStyles: {
        fontSize: 9,
        valign: "middle",
        lineColor: [200, 200, 200],
        lineWidth: 0.2,
      },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 30 },
        2: { cellWidth: 22, halign: "center" },
        3: { cellWidth: 45 },
        4: { cellWidth: 30 },
        5: { cellWidth: 30, halign: "right" },
        6: { cellWidth: 30, halign: "right" },
        7: { cellWidth: 30, halign: "right" },
        8: { cellWidth: 25, halign: "center" },
        9: { cellWidth: 25, halign: "center" },
        10: { cellWidth: 25, halign: "center" },
      },
      didDrawPage: (data) => {
        // Footer
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(
          `Page ${data.pageNumber}`,
          pageWidth / 2,
          doc.internal.pageSize.height - 10,
          { align: "center" }
        );
      },
    });

    // Add Report Summary below the table
    const finalY = (doc as any).lastAutoTable.finalY + 15;

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("REPORT SUMMARY", margin, finalY);

    doc.setDrawColor(52, 152, 219); // Blue separator line
    doc.setLineWidth(0.5);
    doc.line(margin, finalY + 3, pageWidth - margin, finalY + 3);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    // Summary details
    const detailsY = finalY + 12;
    const allocationPercent =
      totals.totalReceived > 0
        ? ((totals.totalAllocated / totals.totalReceived) * 100).toFixed(1)
        : "0.0";

    // First row
    doc.text(`Total Payments: ${data.length}`, margin, detailsY);
    doc.text(
      `Total Received: ${this.formatCurrency(totals.totalReceived, true)}`,
      margin + 80,
      detailsY
    );
    doc.text(
      `Total Allocated: ${this.formatCurrency(totals.totalAllocated, true)}`,
      margin + 160,
      detailsY
    );
    doc.text(
      `Total Remaining: ${this.formatCurrency(totals.remainingAmount, true)}`,
      margin + 240,
      detailsY
    );

    // Second row
    doc.setFont("helvetica", "bold");
    doc.text(`Allocation Rate: ${allocationPercent}%`, margin, detailsY + 8);

    // Payment statistics - third row
    const completedPayments = data.filter(
      (item) => item.payment?.status === "completed"
    ).length;
    const pendingPayments = data.filter(
      (item) => item.payment?.status === "pending"
    ).length;
    const cancelledPayments = data.length - completedPayments - pendingPayments;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(`Completed: ${completedPayments}`, margin, detailsY + 16);
    doc.text(`Pending: ${pendingPayments}`, margin + 60, detailsY + 16);
    doc.text(`Cancelled: ${cancelledPayments}`, margin + 120, detailsY + 16);

    // Save PDF
    const fileName = `Payments_Details_${dayjs().format("YYYY-MM-DD")}.pdf`;
    doc.save(fileName);
  },

  // Generate comprehensive payment details report (multiple payments)
  async generatePaymentDetailsReportPDF(
    data: any[],
    totals: any,
    filters: any = {}
  ): Promise<void> {
    const doc = new jsPDF("landscape");
    const pageWidth = doc.internal.pageSize.width;
    const margin = 15;

    // Title
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("PAYMENT DETAILS REPORT", pageWidth / 2, 20, { align: "center" });

    // Subtitle with highlight
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");

    const subtitleText = "Comprehensive Payment Allocations and Details";
    const subtitleWidth = doc.getTextWidth(subtitleText);
    const subtitleX = (pageWidth - subtitleWidth) / 2;

    // Draw highlight background for subtitle
    doc.setFillColor(52, 152, 219);
    doc.roundedRect(subtitleX - 8, 28, subtitleWidth + 16, 10, 3, 3, "F");

    // Draw subtitle text
    doc.setTextColor(255, 255, 255);
    doc.text(subtitleText, pageWidth / 2, 34, { align: "center" });

    // Reset text color
    doc.setTextColor(0, 0, 0);

    // Filters info
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    let filterText = "All Payments";
    if (filters.method && filters.method !== "all") {
      filterText += ` • Method: ${filters.method}`;
    }
    if (filters.status && filters.status !== "all") {
      filterText += ` • Status: ${filters.status}`;
    }
    if (filters.dateRange) {
      filterText += ` • Date: ${filters.dateRange}`;
    }

    doc.text(filterText, margin, 45);
    doc.text(
      `Generated: ${dayjs().format("DD/MM/YYYY HH:mm")}`,
      pageWidth - margin,
      45,
      { align: "right" }
    );

    let currentY = 55;

    // Process each payment
    data.forEach((item, index) => {
      const payment = item.payment;

      // Check if we need a new page
      if (currentY > doc.internal.pageSize.height - 50) {
        doc.addPage("landscape");
        currentY = 20;
      }

      // Payment header with border
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, currentY, pageWidth - 2 * margin, 25, "F");
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.rect(margin, currentY, pageWidth - 2 * margin, 25, "D");

      // Payment number and status
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(41, 128, 185);
      doc.text(
        `PAYMENT: ${payment.payment_number}`,
        margin + 10,
        currentY + 10
      );

      // Payment method and status tags
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const methodColor = this.getPaymentMethodColor(payment.payment_method);
      const statusColor = this.getPaymentStatusColor(payment.status);

      // Draw method tag
      doc.setFillColor(methodColor[0], methodColor[1], methodColor[2]);
      doc.roundedRect(margin + 120, currentY + 5, 50, 12, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(
        payment.payment_method.replace("_", " ").toUpperCase(),
        margin + 145,
        currentY + 11,
        { align: "center" }
      );

      // Draw status tag
      doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
      doc.roundedRect(margin + 175, currentY + 5, 50, 12, 2, 2, "F");
      doc.text(payment.status.toUpperCase(), margin + 200, currentY + 11, {
        align: "center",
      });

      // Amount
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 185, 107);
      doc.text(
        `PKR ${payment.total_received.toLocaleString()}`,
        pageWidth - margin - 10,
        currentY + 10,
        { align: "right" }
      );

      currentY += 30;

      // Payment details in two columns
      const detailsLeft = [
        `Date: ${dayjs(payment.payment_date).format("DD/MM/YYYY")}`,
        `Customer: ${payment.customer?.company_name || "-"}`,
        `Contact: ${payment.customer?.first_name || ""} ${
          payment.customer?.last_name || ""
        }`,
        `Mobile: ${payment.customer?.mobile || "-"}`,
      ];

      const detailsRight = [
        payment.reference_number
          ? `Reference: ${payment.reference_number}`
          : null,
        payment.bank_name ? `Bank: ${payment.bank_name}` : null,
        payment.cheque_date
          ? `Cheque Date: ${dayjs(payment.cheque_date).format("DD/MM/YYYY")}`
          : null,
        payment.notes
          ? `Notes: ${payment.notes.substring(0, 40)}${
              payment.notes.length > 40 ? "..." : ""
            }`
          : null,
      ].filter(Boolean);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);

      // Left column
      detailsLeft.forEach((detail, i) => {
        doc.text(detail, margin + 10, currentY + i * 6);
      });

      // Right column
      detailsRight.forEach((detail, i) => {
        doc.text(detail, margin + 120, currentY + i * 6);
      });

      currentY += Math.max(detailsLeft.length, detailsRight.length) * 6 + 10;

      // Allocation summary box
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, currentY, pageWidth - 2 * margin, 20, "F");
      doc.setDrawColor(220, 220, 220);
      doc.rect(margin, currentY, pageWidth - 2 * margin, 20, "D");

      const summaryWidth = (pageWidth - 2 * margin) / 3;

      // Total Received
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60, 60, 60);
      doc.text("TOTAL RECEIVED", margin + summaryWidth / 2, currentY + 8, {
        align: "center",
      });
      doc.setFontSize(12);
      doc.setTextColor(0, 185, 107);
      doc.text(
        `PKR ${payment.total_received.toLocaleString()}`,
        margin + summaryWidth / 2,
        currentY + 16,
        { align: "center" }
      );

      // Allocated
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60, 60, 60);
      doc.text(
        "ALLOCATED",
        margin + summaryWidth + summaryWidth / 2,
        currentY + 8,
        { align: "center" }
      );
      doc.setFontSize(12);
      doc.setTextColor(24, 144, 255);
      doc.text(
        `PKR ${item.totalAllocated.toLocaleString()}`,
        margin + summaryWidth + summaryWidth / 2,
        currentY + 16,
        { align: "center" }
      );

      // Remaining
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60, 60, 60);
      doc.text(
        "REMAINING",
        margin + 2 * summaryWidth + summaryWidth / 2,
        currentY + 8,
        { align: "center" }
      );
      doc.setFontSize(12);
      const remainingColor =
        item.remainingAmount > 0
          ? [250, 173, 20]
          : item.remainingAmount < 0
          ? [255, 77, 79]
          : [0, 185, 107];
      doc.setTextColor(remainingColor[0], remainingColor[1], remainingColor[2]);
      doc.text(
        `PKR ${item.remainingAmount.toLocaleString()}`,
        margin + 2 * summaryWidth + summaryWidth / 2,
        currentY + 16,
        { align: "center" }
      );

      currentY += 25;

      // Allocations table
      if (item.payment.allocations && item.payment.allocations.length > 0) {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(60, 60, 60);
        doc.text("PAYMENT ALLOCATIONS", margin, currentY);

        currentY += 8;

        const allocationData = item.payment.allocations.map(
          (alloc: any, allocIndex: number) => [
            (allocIndex + 1).toString(),
            alloc.payee_name,
            alloc.payee_type.toUpperCase(),
            alloc.purpose || "-",
            `PKR ${alloc.amount.toLocaleString()}`,
            dayjs(alloc.allocation_date).format("DD/MM/YY"),
            alloc.notes || "-",
          ]
        );

        autoTable(doc, {
          head: [["#", "Payee", "Type", "Purpose", "Amount", "Date", "Notes"]],
          body: allocationData,
          startY: currentY,
          margin: { left: margin, right: margin },
          theme: "grid",
          styles: {
            fontSize: 8,
            cellPadding: 2,
            overflow: "linebreak",
            lineColor: [200, 200, 200],
            lineWidth: 0.1,
          },
          headStyles: {
            fillColor: [52, 152, 219],
            textColor: 255,
            fontStyle: "bold",
            fontSize: 9,
          },
          bodyStyles: { fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 10, halign: "center" },
            1: { cellWidth: 40 },
            2: { cellWidth: 25, halign: "center" },
            3: { cellWidth: 50 },
            4: { cellWidth: 30, halign: "right" },
            5: { cellWidth: 25, halign: "center" },
            6: { cellWidth: 40 },
          },
        });

        currentY = (doc as any).lastAutoTable.finalY + 15;
      } else {
        doc.setFontSize(10);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(150, 150, 150);
        doc.text("No allocations found for this payment", margin, currentY);
        currentY += 10;
      }

      // TIMELINE SECTION REMOVED - Just add spacing
      currentY += 10;

      // Separator line between payments
      if (index < data.length - 1) {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(margin, currentY, pageWidth - margin, currentY);
        currentY += 10;
      }
    });

    // Add summary page
    doc.addPage("landscape");

    // Summary title
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("PAYMENT DETAILS REPORT - SUMMARY", pageWidth / 2, 30, {
      align: "center",
    });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Report Period: ${filters.dateRange || "All dates"}`, margin, 45);
    doc.text(
      `Generated: ${dayjs().format("DD/MM/YYYY HH:mm")}`,
      pageWidth - margin,
      45,
      { align: "right" }
    );

    // Summary statistics
    const summaryY = 60;

    // Summary table
    const summaryData = [
      ["Total Payments", data.length.toString()],
      ["Total Received", `PKR ${totals.totalReceived.toLocaleString()}`],
      ["Total Allocated", `PKR ${totals.totalAllocated.toLocaleString()}`],
      ["Total Remaining", `PKR ${totals.remainingAmount.toLocaleString()}`],
      [
        "Allocation Rate",
        totals.totalReceived > 0
          ? `${((totals.totalAllocated / totals.totalReceived) * 100).toFixed(
              1
            )}%`
          : "0%",
      ],
    ];

    autoTable(doc, {
      body: summaryData,
      startY: summaryY,
      margin: { left: margin, right: margin },
      theme: "plain",
      styles: {
        fontSize: 11,
        cellPadding: 6,
        lineColor: [200, 200, 200],
        lineWidth: 0.5,
      },
      columnStyles: {
        0: { cellWidth: 150, fontStyle: "bold", halign: "left" },
        1: { cellWidth: 100, halign: "right" },
      },
    });

    // Payment method breakdown
    const methodBreakdownY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("PAYMENT METHOD BREAKDOWN", margin, methodBreakdownY);

    // Calculate method breakdown
    const methodCounts: Record<string, number> = {};
    data.forEach((item) => {
      const method = item.payment.payment_method;
      methodCounts[method] = (methodCounts[method] || 0) + 1;
    });

    const methodData = Object.entries(methodCounts).map(([method, count]) => [
      method.replace("_", " ").toUpperCase(),
      count.toString(),
      `${((count / data.length) * 100).toFixed(1)}%`,
    ]);

    autoTable(doc, {
      head: [["Payment Method", "Count", "Percentage"]],
      body: methodData,
      startY: methodBreakdownY + 10,
      margin: { left: margin, right: margin },
      theme: "grid",
      styles: {
        fontSize: 10,
        cellPadding: 4,
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [52, 152, 219],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 11,
      },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 40, halign: "center" },
        2: { cellWidth: 40, halign: "center" },
      },
    });

    // Status breakdown
    const statusBreakdownY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("PAYMENT STATUS BREAKDOWN", margin, statusBreakdownY);

    // Calculate status breakdown
    const statusCounts: Record<string, number> = {};
    data.forEach((item) => {
      const status = item.payment.status;
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    const statusData = Object.entries(statusCounts).map(([status, count]) => [
      status.toUpperCase(),
      count.toString(),
      `${((count / data.length) * 100).toFixed(1)}%`,
    ]);

    autoTable(doc, {
      head: [["Status", "Count", "Percentage"]],
      body: statusData,
      startY: statusBreakdownY + 10,
      margin: { left: margin, right: margin },
      theme: "grid",
      styles: {
        fontSize: 10,
        cellPadding: 4,
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [82, 196, 26],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 11,
      },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 40, halign: "center" },
        2: { cellWidth: 40, halign: "center" },
      },
    });

    // Save PDF
    const fileName = `Payment_Details_Report_${dayjs().format(
      "YYYY-MM-DD"
    )}.pdf`;
    doc.save(fileName);
  },

  // Generate single payment report (like side panel)
  async generateSinglePaymentReportPDF(paymentDetail: any): Promise<void> {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 15;

    const payment = paymentDetail.payment;

    // Header with payment number
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(41, 128, 185);
    doc.text(`PAYMENT DETAILS REPORT`, pageWidth / 2, 20, { align: "center" });

    doc.setFontSize(14);
    doc.text(payment.payment_number, pageWidth / 2, 30, { align: "center" });

    // Status and method tags
    doc.setFontSize(10);
    const methodColor = this.getPaymentMethodColor(payment.payment_method);
    const statusColor = this.getPaymentStatusColor(payment.status);

    // Method tag
    doc.setFillColor(methodColor[0], methodColor[1], methodColor[2]);
    doc.roundedRect(pageWidth / 2 - 60, 35, 50, 10, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.text(
      payment.payment_method.replace("_", " ").toUpperCase(),
      pageWidth / 2 - 35,
      40,
      { align: "center" }
    );

    // Status tag
    doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.roundedRect(pageWidth / 2 + 10, 35, 50, 10, 2, 2, "F");
    doc.text(payment.status.toUpperCase(), pageWidth / 2 + 35, 40, {
      align: "center",
    });

    // Amount
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 185, 107);
    doc.text(
      `PKR ${payment.total_received.toLocaleString()}`,
      pageWidth / 2,
      55,
      { align: "center" }
    );

    let currentY = 65;

    // Payment Details
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text("PAYMENT DETAILS", margin, currentY);
    currentY += 10;

    const details = [
      {
        label: "Payment Date",
        value: dayjs(payment.payment_date).format("DD/MM/YYYY"),
      },
      { label: "Customer", value: payment.customer?.company_name || "-" },
      {
        label: "Contact Person",
        value: `${payment.customer?.first_name || ""} ${
          payment.customer?.last_name || ""
        }`,
      },
      { label: "Mobile", value: payment.customer?.mobile || "-" },
      { label: "Reference Number", value: payment.reference_number || "-" },
      { label: "Bank Name", value: payment.bank_name || "-" },
      {
        label: "Cheque Date",
        value: payment.cheque_date
          ? dayjs(payment.cheque_date).format("DD/MM/YYYY")
          : "-",
      },
      { label: "Notes", value: payment.notes || "-" },
    ];

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    details.forEach((detail) => {
      if (currentY > doc.internal.pageSize.height - 20) {
        doc.addPage();
        currentY = 20;
      }

      doc.setTextColor(100, 100, 100);
      doc.text(`${detail.label}:`, margin, currentY);
      doc.setTextColor(60, 60, 60);
      doc.text(detail.value, margin + 60, currentY);
      currentY += 6;
    });

    currentY += 5;

    // Allocation Summary
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text("ALLOCATION SUMMARY", margin, currentY);
    currentY += 10;

    const summaryWidth = (pageWidth - 2 * margin) / 3;

    // Draw summary boxes
    [0, 1, 2].forEach((i) => {
      doc.setFillColor(245, 245, 245);
      doc.rect(margin + i * summaryWidth, currentY, summaryWidth - 5, 25, "F");
      doc.setDrawColor(220, 220, 220);
      doc.rect(margin + i * summaryWidth, currentY, summaryWidth - 5, 25, "D");
    });

    // Total Received
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text("TOTAL RECEIVED", margin + summaryWidth / 2 - 2.5, currentY + 8, {
      align: "center",
    });
    doc.setFontSize(12);
    doc.setTextColor(0, 185, 107);
    doc.text(
      `PKR ${payment.total_received.toLocaleString()}`,
      margin + summaryWidth / 2 - 2.5,
      currentY + 18,
      { align: "center" }
    );

    // Allocated
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text(
      "ALLOCATED",
      margin + summaryWidth + summaryWidth / 2 - 2.5,
      currentY + 8,
      { align: "center" }
    );
    doc.setFontSize(12);
    doc.setTextColor(24, 144, 255);
    doc.text(
      `PKR ${paymentDetail.totalAllocated.toLocaleString()}`,
      margin + summaryWidth + summaryWidth / 2 - 2.5,
      currentY + 18,
      { align: "center" }
    );

    // Remaining
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text(
      "REMAINING",
      margin + 2 * summaryWidth + summaryWidth / 2 - 2.5,
      currentY + 8,
      { align: "center" }
    );
    doc.setFontSize(12);
    const remainingColor =
      paymentDetail.remainingAmount > 0
        ? [250, 173, 20]
        : paymentDetail.remainingAmount < 0
        ? [255, 77, 79]
        : [0, 185, 107];
    doc.setTextColor(remainingColor[0], remainingColor[1], remainingColor[2]);
    doc.text(
      `PKR ${paymentDetail.remainingAmount.toLocaleString()}`,
      margin + 2 * summaryWidth + summaryWidth / 2 - 2.5,
      currentY + 18,
      { align: "center" }
    );

    currentY += 30;

    // Allocations table
    if (payment.allocations && payment.allocations.length > 0) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60, 60, 60);
      doc.text("PAYMENT ALLOCATIONS", margin, currentY);
      currentY += 8;

      const allocationData = payment.allocations.map(
        (alloc: any, index: number) => [
          (index + 1).toString(),
          alloc.payee_name,
          alloc.payee_type.toUpperCase(),
          `PKR ${alloc.amount.toLocaleString()}`,
          dayjs(alloc.allocation_date).format("DD/MM/YYYY"),
          alloc.purpose || "-",
        ]
      );

      autoTable(doc, {
        head: [["#", "Payee", "Type", "Amount", "Date", "Purpose"]],
        body: allocationData,
        startY: currentY,
        margin: { left: margin, right: margin },
        theme: "grid",
        styles: {
          fontSize: 9,
          cellPadding: 3,
          overflow: "linebreak",
          lineColor: [200, 200, 200],
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: [52, 152, 219],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 10,
        },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 40 },
          2: { cellWidth: 25, halign: "center" },
          3: { cellWidth: 30, halign: "right" },
          4: { cellWidth: 30, halign: "center" },
          5: { cellWidth: 45 },
        },
      });

      currentY = (doc as any).lastAutoTable.finalY + 10;
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Generated: ${dayjs().format("DD/MM/YYYY HH:mm")}`,
      pageWidth / 2,
      doc.internal.pageSize.height - 10,
      { align: "center" }
    );

    // Save PDF
    const fileName = `Payment_Report_${payment.payment_number}_${dayjs().format(
      "YYYY-MM-DD"
    )}.pdf`;
    doc.save(fileName);
  },

  // Helper methods for colors
  getPaymentMethodColor(method: string): number[] {
    const colors: Record<string, number[]> = {
      cash: [82, 196, 26], // Green
      bank_transfer: [24, 144, 255], // Blue
      cheque: [250, 173, 20], // Orange
      parchi: [114, 46, 209], // Purple
      jazzcash: [245, 34, 45], // Red
      easypaisa: [19, 194, 194], // Cyan
    };
    return colors[method] || [150, 150, 150]; // Gray default
  },

  getPaymentStatusColor(status: string): number[] {
    const colors: Record<string, number[]> = {
      pending: [250, 173, 20], // Orange
      completed: [82, 196, 26], // Green
      cancelled: [245, 34, 45], // Red
    };
    return colors[status] || [150, 150, 150]; // Gray default
  },

  // Helper to format currency with option to include PKR
  formatCurrency(amount: number, includePKR: boolean = true): string {
    if (amount === 0) return includePKR ? "PKR 0" : "0";

    const isNegative = amount < 0;
    const absAmount = Math.abs(amount);

    // Format with commas for thousands
    const formatted = absAmount.toLocaleString("en-PK", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

    return `${includePKR ? "PKR " : ""}${formatted}${isNegative ? " DR" : ""}`;
  },
};
