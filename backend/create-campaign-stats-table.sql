-- Create campaign_stats table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='campaign_stats' AND xtype='U')
CREATE TABLE campaign_stats (
    id INT IDENTITY(1,1) PRIMARY KEY,
    campaign_id INT NOT NULL,
    total_sent INT DEFAULT 0,
    total_opened INT DEFAULT 0,
    total_clicked INT DEFAULT 0,
    total_bounced INT DEFAULT 0,
    total_unsubscribed INT DEFAULT 0,
    open_rate DECIMAL(5,2) DEFAULT 0.00,
    click_rate DECIMAL(5,2) DEFAULT 0.00,
    bounce_rate DECIMAL(5,2) DEFAULT 0.00,
    unsubscribe_rate DECIMAL(5,2) DEFAULT 0.00,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (campaign_id) REFERENCES Campaigns(id) ON DELETE CASCADE
);

-- Insert stats for existing campaigns
INSERT INTO campaign_stats (campaign_id, total_sent, total_opened, total_clicked, total_bounced, total_unsubscribed, open_rate, click_rate, bounce_rate, unsubscribe_rate)
SELECT 
    c.id as campaign_id,
    COALESCE(c.recipient_count, 0) as total_sent,
    COALESCE(c.opened_count, 0) as total_opened,
    COALESCE(c.clicked_count, 0) as total_clicked,
    COALESCE(c.bounced_count, 0) as total_bounced,
    COALESCE(c.unsubscribed_count, 0) as total_unsubscribed,
    CASE 
        WHEN COALESCE(c.recipient_count, 0) > 0 
        THEN CAST(COALESCE(c.opened_count, 0) * 100.0 / c.recipient_count AS DECIMAL(5,2))
        ELSE 0.00 
    END as open_rate,
    CASE 
        WHEN COALESCE(c.opened_count, 0) > 0 
        THEN CAST(COALESCE(c.clicked_count, 0) * 100.0 / c.opened_count AS DECIMAL(5,2))
        ELSE 0.00 
    END as click_rate,
    CASE 
        WHEN COALESCE(c.recipient_count, 0) > 0 
        THEN CAST(COALESCE(c.bounced_count, 0) * 100.0 / c.recipient_count AS DECIMAL(5,2))
        ELSE 0.00 
    END as bounce_rate,
    CASE 
        WHEN COALESCE(c.recipient_count, 0) > 0 
        THEN CAST(COALESCE(c.unsubscribed_count, 0) * 100.0 / c.recipient_count AS DECIMAL(5,2))
        ELSE 0.00 
    END as unsubscribe_rate
FROM Campaigns c
WHERE NOT EXISTS (
    SELECT 1 FROM campaign_stats cs WHERE cs.campaign_id = c.id
);

-- Create indexes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_campaign_stats_campaign_id')
CREATE INDEX IX_campaign_stats_campaign_id ON campaign_stats(campaign_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_campaign_stats_created_at')
CREATE INDEX IX_campaign_stats_created_at ON campaign_stats(created_at);

PRINT 'campaign_stats table created successfully';