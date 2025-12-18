// src/pages/LandingPage.tsx - UPDATED
import React from "react";
import { Button, Card, Row, Col } from "antd";
import { useNavigate } from "react-router-dom";
import "./LandingPage.css";

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  const handleEnterSoftware = () => {
    navigate("/login"); // Changed from "/dashboard" to "/login"
  };

  return (
    <div className="landing-page">
      {/* Header */}
      <header className="landing-header">
        <div className="header-content">
          <div className="logo-section">
            <h1 className="company-name">BinFazal Enterprises</h1>
            <p className="company-tagline">
              From Code to Print, We Build It All
            </p>
          </div>

          <nav className="navigation">
            <a href="#services" className="nav-link">
              Services
            </a>
            <a href="#features" className="nav-link">
              Features
            </a>
            <a href="#about" className="nav-link">
              About
            </a>
          </nav>

          <div className="header-actions">
            <Button
              type="primary"
              size="large"
              onClick={handleEnterSoftware}
              className="enter-button"
            >
              Enter Software
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">
            Professional Accounting Software
            <span className="highlight">for Ahsan Dogar Rubber Works</span>
          </h1>
          <p className="hero-description">
            Streamline your finances with our comprehensive accounting solution.
            From invoicing to reporting, we've got you covered.
          </p>
          <Button
            type="primary"
            size="large"
            onClick={handleEnterSoftware}
            className="cta-button"
          >
            Launch Accounting Software
          </Button>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="services-section">
        <div className="section-container">
          <div className="section-header">
            <h2 className="section-title">Our Services</h2>
            <p className="section-subtitle">
              Comprehensive solutions for your business needs
            </p>
          </div>

          <Row gutter={[24, 24]} className="services-grid">
            <Col xs={24} md={8}>
              <Card className="service-card">
                <div className="service-icon software">💻</div>
                <h3 className="service-title">Software Development</h3>
                <p className="service-description">
                  Custom software solutions tailored to your business
                  requirements
                </p>
              </Card>
            </Col>

            <Col xs={24} md={8}>
              <Card className="service-card">
                <div className="service-icon accounting">📊</div>
                <h3 className="service-title">Bookkeeping Software</h3>
                <p className="service-description">
                  Professional accounting software with all the features you
                  need
                </p>
              </Card>
            </Col>

            <Col xs={24} md={8}>
              <Card className="service-card">
                <div className="service-icon printing">🖨️</div>
                <h3 className="service-title">Printing Services</h3>
                <p className="service-description">
                  High-quality printing services for all your business materials
                </p>
              </Card>
            </Col>
          </Row>
        </div>
      </section>

      {/* Features Preview */}
      <section id="features" className="features-section">
        <div className="section-container">
          <div className="section-header">
            <h2 className="section-title">Software Features</h2>
            <p className="section-subtitle">
              Everything you need to manage your finances
            </p>
          </div>

          <Row gutter={[16, 16]} className="features-grid">
            {[
              "Double-Entry Accounting",
              "Invoice Management",
              "Expense Tracking",
              "Financial Reports",
              "Bank Reconciliation",
              "Tax Management",
              "Multi-User Access",
              "Mobile Friendly",
            ].map((feature, index) => (
              <Col key={index} xs={24} sm={12} lg={6}>
                <Card className="feature-card">
                  <div className="feature-item">
                    <div className="feature-check">✓</div>
                    <span className="feature-text">{feature}</span>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-container">
          <h2 className="cta-title">Ready to Streamline Your Accounting?</h2>
          <p className="cta-description">
            Professional accounting solution for Ahsan Dogar Rubber Works
          </p>
          <Button
            type="default"
            size="large"
            onClick={handleEnterSoftware}
            className="cta-action-button"
          >
            Get Started Now
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-container">
          <h3 className="footer-title">BinFazal Enterprises</h3>
          <p className="footer-tagline">From Code to Print, We Build It All</p>
          <p className="footer-copyright">
            &copy; {new Date().getFullYear()} BinFazal Enterprises. All rights
            reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
