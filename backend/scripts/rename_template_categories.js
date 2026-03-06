const { executeQuery, connectDB, closeDB } = require('../src/config/database');

async function renameCategories() {
    try {
        await connectDB();
        console.log('Starting to rename template categories...');

        const renames = [
            { oldName: '行銷', newName: '行銷組' },
            { oldName: '通知', newName: '訓練組' },
            { oldName: '節日', newName: '資訊組' }
        ];

        for (const { oldName, newName } of renames) {
            // Check if old category exists
            const findOldQuery = `SELECT id FROM TemplateCategories WHERE name = @oldName`;
            const oldResult = await executeQuery(findOldQuery, { oldName });

            if (oldResult.recordset.length === 0) {
                console.log(`Category '${oldName}' not found. Skipping.`);
                continue;
            }

            const oldId = oldResult.recordset[0].id;

            // Check if new category already exists
            const findNewQuery = `SELECT id FROM TemplateCategories WHERE name = @newName`;
            const newResult = await executeQuery(findNewQuery, { newName });

            if (newResult.recordset.length > 0) {
                const newId = newResult.recordset[0].id;
                console.log(`Category '${newName}' already exists (ID: ${newId}). Migrating templates from '${oldName}' (ID: ${oldId})...`);

                // Migrate templates
                const updateTemplatesQuery = `UPDATE Templates SET category_id = @newId WHERE category_id = @oldId`;
                await executeQuery(updateTemplatesQuery, { newId, oldId });

                // Delete old category
                const deleteOldQuery = `DELETE FROM TemplateCategories WHERE id = @oldId`;
                await executeQuery(deleteOldQuery, { oldId });

                console.log(`Migrated templates and deleted '${oldName}'.`);
            } else {
                console.log(`Renaming '${oldName}' to '${newName}'...`);
                const updateQuery = `UPDATE TemplateCategories SET name = @newName WHERE id = @oldId`;
                await executeQuery(updateQuery, { newName, oldId });
                console.log(`Renamed '${oldName}' to '${newName}'.`);
            }
        }

        console.log('Category rename completed successfully.');

    } catch (err) {
        console.error('Error renaming categories:', err);
    } finally {
        await closeDB();
    }
}

renameCategories();
