-- 創建簡化的層次分類存儲過程
USE WintonEDM;
GO

-- 1. 獲取子分類
CREATE PROCEDURE GetCategoryChildren
    @ParentId INT = NULL
AS
BEGIN
    SELECT 
        c.id,
        c.name,
        c.category_type,
        c.parent_id,
        c.level,
        c.path,
        c.sort_order,
        c.is_leaf,
        c.hierarchy_type,
        c.is_active,
        COUNT(sc.subscriber_id) as subscriber_count
    FROM Categories c
    LEFT JOIN SubscriberCategories sc ON c.id = sc.category_id
    WHERE 
        (c.parent_id = @ParentId OR (@ParentId IS NULL AND c.parent_id IS NULL))
        AND c.is_active = 1
    GROUP BY c.id, c.name, c.category_type, c.parent_id, c.level, c.path, 
             c.sort_order, c.is_leaf, c.hierarchy_type, c.is_active
    ORDER BY c.sort_order, c.name;
END;
GO

-- 2. 獲取層次統計
CREATE PROCEDURE GetHierarchyStats
AS
BEGIN
    SELECT 
        hierarchy_type,
        COUNT(*) as total_count,
        COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as root_count,
        MAX(level) as max_level
    FROM Categories
    WHERE is_active = 1
    GROUP BY hierarchy_type
    ORDER BY hierarchy_type;
END;
GO

PRINT '✅ 簡化存儲過程創建完成！';