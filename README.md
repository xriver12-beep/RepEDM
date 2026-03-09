RepEDM System Documentation (README)
Project Overview
RepEDM is an enterprise-grade Electronic Direct Mail (EDM) management system. It provides a one-stop solution ranging from subscriber management and content creation to approval workflows and delivery tracking. The system emphasizes high deliverability, rigorous auditing mechanisms, and an intuitive user interface.

Key Features
1. Email Dispatch & Tracking
Multi-SMTP Support: Supports configuration and rotation across multiple SMTP servers.

Comprehensive Tracking: Full visibility into Open and Click-through rates (CTR).

Automated Handling: Built-in logic for Bounce processing and Unsubscribe requests.

2. Audience Management
Batch Import: Support for subscriber synchronization via Excel/CSV.

Dynamic Segmentation: Flexible tagging and category management.

Filtering: Robust Whitelist and Blacklist mechanisms.

3. Approval Workflow
Customizable Hierarchies: Define multi-level approval stages.

Access Control: Supports Role-based (RBAC) and User-based approval assignments.

Integrations: Instant notifications via Email and Slack for pending approvals.

4. Frequency Capping
Global Limits: Restrict the maximum number of emails a subscriber can receive within a specific window (e.g., 30 days).

Force Send: Emergency campaigns can utilize the force_send parameter to bypass frequency restrictions.

Real-time Preview: Live calculation of recipients affected by frequency capping during the campaign creation phase.

5. System Security
Two-Factor Authentication (2FA).

Account Lockout: Mechanism to prevent brute-force attacks after repeated failed login attempts.

Password Policy: Mandatory enforcement of password complexity standards.

System Architecture
Backend: Node.js + Express.js

Frontend: HTML5 + CSS3 + Vanilla JavaScript (Framework-free, lightweight design)

Database: Microsoft SQL Server (MSSQL)

Protocol: RESTful API

Installation & Execution
Prerequisites
Node.js: v16 or higher

Microsoft SQL Server

IIS (Optional: for deployment as a Windows Service)

Installation Steps
Clone the Repository:

Bash
git clone <repository_url>
cd RepEDM
Install Backend Dependencies:

Bash
cd backend
npm install
Environment Configuration:

Copy .env.example to .env.

Configure your Database Connection String, JWT Secret, and other credentials.

Initialize Database:

Run scripts/init_db.sql to create tables and seed default data.

Starting the Services
Start Backend Server:

Bash
cd backend
npm start
Default Port: 3001

Launch Frontend:
Use Live Server (for development) or deploy directly to IIS / Nginx.

Configuration Guide
Frequency Capping Settings
Navigate to System Settings -> Frequency Capping:

Enable/Disable: Global toggle for the feature.

Send Limit: Maximum emails allowed per period (Default: 4).

Calculation Cycle: Time range for the limit (Default: 30 days).

Exclude Test Emails: Choose whether test dispatches count toward the quota.

