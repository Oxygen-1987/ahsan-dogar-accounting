import React, { useState, useEffect } from "react";
import { Card, Alert, Button, Space, Typography, Collapse } from "antd";
import { customerService } from "../../services/customerService";

const { Text, Paragraph } = Typography;
const { Panel } = Collapse;

const SupabaseSetupHelper: React.FC = () => {
  const [hasTableIssues, setHasTableIssues] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    checkTableStructure();
  }, []);

  const checkTableStructure = async () => {
    try {
      const isUsingMock = await customerService.isUsingMockData();
      setHasTableIssues(isUsingMock);
    } catch (error) {
      console.log("Error checking table structure:", error);
      setHasTableIssues(true);
    } finally {
      setLoading(false);
    }
  };

  const handleResetConnection = async () => {
    await customerService.resetConnection();
    // Re-check the table structure after reset
    await checkTableStructure();
  };

  const copySQLToClipboard = (sqlType: "fix" | "recreate") => {
    let sql = "";

    if (sqlType === "fix") {
      sql = `-- Fix existing customers table structure
DO $$ 
BEGIN
    -- Add company_name if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'customers' AND column_name = 'company_name') THEN
        ALTER TABLE customers ADD COLUMN company_name VARCHAR(255);
        UPDATE customers SET company_name = first_name || ' ' || last_name || ' Business' WHERE company_name IS NULL;
        ALTER TABLE customers ALTER COLUMN company_name SET NOT NULL;
    END IF;

    -- Add other essential columns if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'customers' AND column_name = 'first_name') THEN
        ALTER TABLE customers ADD COLUMN first_name VARCHAR(255);
        UPDATE customers SET first_name = 'Customer' WHERE first_name IS NULL;
        ALTER TABLE customers ALTER COLUMN first_name SET NOT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'customers' AND column_name = 'last_name') THEN
        ALTER TABLE customers ADD COLUMN last_name VARCHAR(255);
        UPDATE customers SET last_name = id::text WHERE last_name IS NULL;
        ALTER TABLE customers ALTER COLUMN last_name SET NOT NULL;
    END IF;
END $$;`;
    } else {
      sql = `-- RECREATE CUSTOMERS TABLE (WILL DELETE ALL DATA)
-- Drop all dependent tables
DROP TABLE IF EXISTS ledger_entries CASCADE;
DROP TABLE IF EXISTS payment_allocations CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS invoice_items CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

-- Recreate customers table
CREATE TABLE customers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    mobile VARCHAR(20) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Pakistan',
    notes TEXT,
    opening_balance DECIMAL(15,2) DEFAULT 0,
    current_balance DECIMAL(15,2) DEFAULT 0,
    as_of_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert sample data
INSERT INTO customers (first_name, last_name, company_name, mobile, phone, email, address, city, state, opening_balance, current_balance) VALUES
('Ahsan', 'Dogar', 'Ahsan Dogar Rubber Works', '+923001234567', '+92421234567', 'ahsan@dogarrubber.com', '123 Industrial Area', 'Lahore', 'Punjab', 50000, 50000),
('Ali', 'Khan', 'Khan Rubber Industries', '+923007654321', '+92427654321', 'ali@khanrubber.com', '456 Commercial Area', 'Karachi', 'Sindh', 25000, 25000);`;
    }

    navigator.clipboard.writeText(sql).then(() => {
      alert(
        `SQL (${sqlType === "fix" ? "Fix" : "Recreate"}) copied to clipboard!`
      );
    });
  };

  if (loading) {
    return null; // Don't show anything while checking
  }

  if (!hasTableIssues) {
    return null; // Don't show helper if tables are fine
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <Alert
        message="Database Structure Issue"
        description={
          <div>
            <Paragraph>
              The customers table structure doesn't match the application
              requirements.
            </Paragraph>

            <Collapse ghost>
              <Panel header="Solution Options" key="1">
                <Space direction="vertical" style={{ width: "100%" }}>
                  <div>
                    <Text strong>
                      Option 1: Fix Existing Table (Recommended)
                    </Text>
                    <br />
                    <Text type="secondary">
                      Adds missing columns to your existing table without losing
                      data.
                    </Text>
                    <br />
                    <Button
                      type="primary"
                      onClick={() => copySQLToClipboard("fix")}
                      style={{ marginTop: 8 }}
                    >
                      Copy Fix SQL
                    </Button>
                  </div>

                  <div>
                    <Text strong>Option 2: Recreate Table</Text>
                    <br />
                    <Text type="secondary" style={{ color: "red" }}>
                      WARNING: This will delete all customer data and related
                      records!
                    </Text>
                    <br />
                    <Button
                      danger
                      onClick={() => copySQLToClipboard("recreate")}
                      style={{ marginTop: 8 }}
                    >
                      Copy Recreate SQL
                    </Button>
                  </div>
                </Space>
              </Panel>
            </Collapse>

            <Paragraph style={{ marginTop: 16 }}>
              <Text strong>Instructions:</Text>
            </Paragraph>
            <ol style={{ marginBottom: 16, paddingLeft: 20 }}>
              <li>Copy one of the SQL solutions above</li>
              <li>Go to Supabase SQL Editor and paste the SQL</li>
              <li>Run the SQL query</li>
              <li>Click "Check Connection" below</li>
            </ol>

            <Space>
              <Button onClick={handleResetConnection}>Check Connection</Button>
              <Button
                onClick={() =>
                  window.open("https://supabase.com/dashboard", "_blank")
                }
                type="default"
              >
                Open Supabase
              </Button>
            </Space>
          </div>
        }
        type="warning"
        showIcon
      />
    </Card>
  );
};

export default SupabaseSetupHelper;
