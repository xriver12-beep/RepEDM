const campaignsData = {
    data: {
        campaigns: [
            {
                id: 46,
                name: '2026年edm 測試作業',
                status: 'sent',
                sentAt: '2026-01-04T00:00:00.000Z',
                stats: {
                    sentCount: 3,
                    openedCount: 0,
                    clickedCount: 0,
                    bouncedCount: 0,
                    unsubscribedCount: 0
                }
            }
        ]
    }
};

const campaigns = campaignsData.data.campaigns.map(c => {
    const sent = c.stats.sentCount || 0;
    const opens = c.stats.openedCount || 0;
    const clicks = c.stats.clickedCount || 0;
    const unsubscribes = c.stats.unsubscribedCount || 0;
    const bounces = c.stats.bouncedCount || 0;

    // 計算成功率與失敗率
    const failures = bounces;
    const successes = sent - failures;

    return {
        id: c.id,
        name: c.name,
        status: c.status,
        sent_date: c.sentAt,
        sent,
        opens,
        clicks,
        unsubscribes,
        bounces,
        successes,
        failures,
        open_rate: sent > 0 ? (opens / sent) * 100 : 0,
        click_rate: sent > 0 ? (clicks / sent) * 100 : 0,
        unsubscribe_rate: sent > 0 ? (unsubscribes / sent) * 100 : 0,
        success_rate: sent > 0 ? (successes / sent) * 100 : 0,
        failure_rate: sent > 0 ? (failures / sent) * 100 : 0
    };
});

console.log(campaigns[0]);
