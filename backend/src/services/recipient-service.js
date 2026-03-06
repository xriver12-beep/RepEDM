const { executeQuery } = require('../config/database');

class RecipientService {
    async getRecipients(campaign) {
        let audienceType = campaign.target_audience;
        let filter = campaign.target_filter;

        // Try to parse filter if it's a string
        if (typeof filter === 'string') {
            try {
                filter = JSON.parse(filter);
            } catch (e) {
                // console.error('Failed to parse target_filter JSON:', e);
                // If parsing fails, it might be that filter is empty or just a string
                if (!filter) filter = {};
            }
        }

        // Also try to parse target_audience if it looks like JSON (starts with {)
        let audienceObj = null;
        if (typeof audienceType === 'string' && audienceType.trim().startsWith('{')) {
            try {
                audienceObj = JSON.parse(audienceType);
                // If it's a JSON object, use its type
                if (audienceObj.type) audienceType = audienceObj.type;
                // And merge properties to filter if filter is empty?
                if (!filter || Object.keys(filter).length === 0) filter = audienceObj;
            } catch (e) {
                // Ignore
            }
        }

        if (!audienceType) return [];

        let recipients = [];
        console.log(`Getting recipients for type: ${audienceType}, filter:`, filter);

        if (audienceType === 'custom') {
            if (filter && filter.method === 'filters') {
                 // Handle custom filters
                 if (Array.isArray(filter.criteria)) {
                     let whereClause = "status IN ('active', 'subscribed')";
                     const params = {};
                     
                     filter.criteria.forEach((c, index) => {
                         const paramName = `val${index}`;
                         let condition = '';
                         let val = c.value;
                         
                         if (c.field === 'location') {
                             if (c.operator === 'equals') condition = `city = @${paramName}`;
                             else if (c.operator === 'contains') { condition = `city LIKE @${paramName}`; val = `%${val}%`; }
                         } else if (c.field === 'gender') {
                             if (c.operator === 'equals') condition = `gender = @${paramName}`;
                         } else if (c.field === 'age') {
                             const dateVal = new Date();
                             dateVal.setFullYear(dateVal.getFullYear() - parseInt(val));
                             const dateStr = dateVal.toISOString().split('T')[0];
                             
                             if (c.operator === 'greater') condition = `birth_date < @${paramName}`;
                             else if (c.operator === 'less') condition = `birth_date > @${paramName}`;
                             else if (c.operator === 'equals') {
                                 const nextYear = new Date(dateVal);
                                 nextYear.setFullYear(nextYear.getFullYear() + 1);
                                 const nextYearStr = nextYear.toISOString().split('T')[0];
                                 condition = `birth_date >= @${paramName} AND birth_date < '${nextYearStr}'`;
                             }
                             val = dateStr;
                         } else if (c.field === 'subscription_date') {
                             if (c.operator === 'greater') condition = `subscribed_at > @${paramName}`;
                             else if (c.operator === 'less') condition = `subscribed_at < @${paramName}`;
                             else if (c.operator === 'equals') condition = `CONVERT(date, subscribed_at) = @${paramName}`;
                         }
                         
                         if (condition) {
                             whereClause += ` AND (${condition})`;
                             params[paramName] = val;
                         }
                     });
                     
                     const query = `SELECT id, email FROM Subscribers WHERE ${whereClause}`;
                     const result = await executeQuery(query, params);
                     recipients = result.recordset;
                 }
            } else if (filter) {
                // Handle filter.emails which could be array or string
                let emailList = [];
                if (filter.emails) {
                    emailList = filter.emails;
                } else if (filter.method === 'emails' && filter.list) {
                     // Some formats might use 'list'
                     emailList = filter.list;
                }

                if (typeof emailList === 'string') {
                     emailList = emailList.split(/[\n,;]+/).map(e => e.trim()).filter(e => e);
                }
                
                if (Array.isArray(emailList)) {
                    // Create initial list
                    let initialRecipients = emailList.map(email => ({ id: null, email }));
                    
                    // Filter out unsubscribed emails (Custom list should also respect unsubscribe status)
                    if (initialRecipients.length > 0) {
                        try {
                            const emailsToCheck = initialRecipients.map(r => r.email);
                            const jsonEmails = JSON.stringify(emailsToCheck.map(e => ({ email: e })));
                            
                            const checkQuery = `
                                SELECT email 
                                FROM Subscribers 
                                WHERE status = 'unsubscribed' 
                                AND email IN (
                                    SELECT email 
                                    FROM OPENJSON(@jsonEmails) 
                                    WITH (email nvarchar(255))
                                )
                            `;
                            
                            const result = await executeQuery(checkQuery, { jsonEmails });
                            const unsubscribedEmails = new Set(result.recordset.map(r => r.email.toLowerCase()));
                            
                            if (unsubscribedEmails.size > 0) {
                                console.log(`Filtered out ${unsubscribedEmails.size} unsubscribed emails from custom list.`);
                                recipients = initialRecipients.filter(r => !unsubscribedEmails.has(r.email.toLowerCase()));
                            } else {
                                recipients = initialRecipients;
                            }
                        } catch (err) {
                            console.warn('Error filtering unsubscribed emails (fallback to sending all):', err);
                            recipients = initialRecipients;
                        }
                    } else {
                        recipients = [];
                    }
                }
            }
        } else if (audienceType === 'active' || audienceType === 'all' || audienceType === 'all_subscribers') {
             const result = await executeQuery(`SELECT id, email FROM Subscribers WHERE status IN ('active', 'subscribed')`);
             recipients = result.recordset;
        } else if (audienceType === 'category' || audienceType === 'groups') {
             // Handle categories
             let categoryIds = [];
             
             if (Array.isArray(filter)) {
                 categoryIds = filter;
             } else if (filter) {
                 if (Array.isArray(filter.categories)) categoryIds = filter.categories;
                 else if (Array.isArray(filter.groups)) {
                     // Check for special groups
                     const groups = filter.groups;
                     if (groups.includes('all_subscribers') || groups.includes('active_users')) {
                         const result = await executeQuery(`SELECT id, email FROM Subscribers WHERE status IN ('active', 'subscribed')`);
                         return result.recordset;
                     }
                     categoryIds = groups;
                 }
             }
             
             // Filter out non-numeric IDs
             const validIds = categoryIds.filter(id => !isNaN(parseInt(id))).map(id => parseInt(id));
             
             if (validIds.length > 0) {
                 const query = `
                    SELECT DISTINCT s.id, s.email 
                    FROM Subscribers s
                    JOIN SubscriberCategories sc ON s.id = sc.subscriber_id
                    WHERE s.status IN ('active', 'subscribed') AND sc.category_id IN (${validIds.join(',')})
                 `;
                 const result = await executeQuery(query);
                 recipients = result.recordset;
             }
        } else {
             console.warn(`Unknown audience type: ${audienceType}`);
        }

        return recipients;
    }
}

module.exports = new RecipientService();
