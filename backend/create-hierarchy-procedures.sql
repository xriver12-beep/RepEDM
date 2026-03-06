-- 創建層次分類管理的存儲過程
USE WintonEDM;
GO

-- 1. 獲取子分類
CREATE PROCEDURE GetCategoryChildren
    @ParentId INT = NULL,
    @HierarchyType NVARCHAR(50) = NULL,
    @IncludeInactive BIT = 0
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
        COUNT(sc.subscriber_id) as subscriber_count,
        (SELECT COUNT(*) FROM Categories child WHERE child.parent_id = c.id) as child_count
    FROM Categories c
    LEFT JOIN SubscriberCategories sc ON c.id = sc.category_id
    WHERE 
        ((@ParentId IS NULL AND c.parent_id IS NULL) OR c.parent_id = @ParentId)
        AND (@HierarchyType IS NULL OR c.hierarchy_type = @HierarchyType)
        AND (@IncludeInactive = 1 OR c.is_active = 1)
    GROUP BY c.id, c.name, c.category_type, c.parent_id, c.level, c.path, 
             c.sort_order, c.is_leaf, c.hierarchy_type, c.is_active
    ORDER BY c.sort_order, c.name;
END;
GO

-- 2. 搜索分類
CREATE PROCEDURE SearchCategories
    @SearchTerm NVARCHAR(100),
    @HierarchyType NVARCHAR(50) = NULL
AS
BEGIN
    SELECT 
        c.id,
        c.name,
        c.category_type,
        c.parent_id,
        c.level,
        c.path,
        c.hierarchy_type,
        p.name as parent_name,
        COUNT(sc.subscriber_id) as subscriber_count
    FROM Categories c
    LEFT JOIN Categories p ON c.parent_id = p.id
    LEFT JOIN SubscriberCategories sc ON c.id = sc.category_id
    WHERE 
        c.is_active = 1
        AND c.name LIKE '%' + @SearchTerm + '%'
        AND (@HierarchyType IS NULL OR c.hierarchy_type = @HierarchyType)
    GROUP BY c.id, c.name, c.category_type, c.parent_id, c.level, c.path,
             c.hierarchy_type, p.name
    ORDER BY c.hierarchy_type, c.level, c.name;
END;
GO

-- 3. 獲取層次類型統計
CREATE PROCEDURE GetHierarchyTypeStats
AS
BEGIN
    SELECT 
        hierarchy_type,
        COUNT(*) as total_count,
        COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as root_count,
        COUNT(CASE WHEN parent_id IS NOT NULL THEN 1 END) as child_count,
        MAX(level) as max_level
    FROM Categories
    WHERE is_active = 1
    GROUP BY hierarchy_type
    ORDER BY hierarchy_type;
END;
GO

PRINT '✅ 基礎存儲過程創建完成！';
PRINT '📋 可用存儲過程:';
PRINT '   - GetCategoryChildren: 獲取子分類';
PRINT '   - SearchCategories: 搜索分類';
PRINT '   - GetHierarchyTypeStats: 獲取層次統計';
GO