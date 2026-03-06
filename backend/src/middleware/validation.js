const Joi = require('joi');
const { AppError } = require('./errorHandler');

// 驗證中介軟體
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error } = schema.validate(req[property], {
      abortEarly: false, // 顯示所有驗證錯誤
      allowUnknown: false, // 不允許未知欄位
      stripUnknown: true // 移除未知欄位
    });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message.replace(/"/g, ''))
        .join(', ');
      
      return next(new AppError(errorMessage, 400));
    }

    next();
  };
};

// 通用驗證規則
const commonValidations = {
  id: Joi.string().guid({ version: 'uuidv4' }).required(),
  email: Joi.string().email().max(255).required(),
  password: Joi.string()
    .min(8)
    .max(100)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .message('密碼必須至少8個字符，且包含大小寫字母和數字')
    .required(),
  name: Joi.string().min(1).max(100).trim(),
  phone: Joi.string().pattern(/^[+]?[\d\s\-()]+$/).max(20),
  url: Joi.string().uri().max(500),
  status: Joi.string().valid('Active', 'Inactive', 'Pending', 'Suspended'),
  pagination: {
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50000).default(10),
    sortBy: Joi.string().max(50),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }
};

// 使用者驗證規則
const userValidations = {
  register: Joi.object({
    username: Joi.string().pattern(/^[a-zA-Z0-9_]+$/).message('使用者名稱只能包含字母、數字和底線').min(3).max(50).required(),
    email: commonValidations.email,
    password: commonValidations.password,
    fullName: commonValidations.name.required(),
    role: Joi.string().valid('Admin', 'Manager', 'Approver', 'User', 'Viewer').default('User')
  }),

  login: Joi.object({
    email: Joi.string().required(),
    password: Joi.string().required()
  }),

  updateProfile: Joi.object({
    fullName: commonValidations.name,
    phone: commonValidations.phone,
    username: Joi.string().pattern(/^[a-zA-Z0-9_]+$/).message('使用者名稱只能包含字母、數字和底線').min(3).max(50),
    email: commonValidations.email
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: commonValidations.password,
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
  }),

  forgotPassword: Joi.object({
    email: Joi.string().email().required()
  }),

  resetPassword: Joi.object({
    token: Joi.string().required(),
    newPassword: commonValidations.password,
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
  })
};

// 訂閱者驗證規則
const subscriberValidations = {
  create: Joi.object({
    email: commonValidations.email,
    firstName: Joi.string().max(100).allow('', null).trim(),
    lastName: Joi.string().max(100).allow('', null).trim(),
    companyName: Joi.string().max(100).allow('', null),
    phone: Joi.string().max(20).allow('', null),
    gender: Joi.string().valid('Male', 'Female', 'Other', '', null),
    birthDate: Joi.date().max('now').allow('', null),
    country: Joi.string().max(100).allow('', null),
    city: Joi.string().max(100).allow('', null),
    tags: Joi.array().items(Joi.string().max(50)).allow(null),
    customFields: Joi.object().allow(null)
  }),

  update: Joi.object({
    email: commonValidations.email,
    status: Joi.string().valid('subscribed', 'unsubscribed', 'bounced', 'complained', 'invalid', 'active', 'inactive'),
    firstName: Joi.string().max(100).allow('').trim(),
    lastName: Joi.string().max(100).allow('').trim(),
    companyName: Joi.string().max(100).allow(''),
    phone: Joi.string().pattern(/^[+]?[\d\s\-()]*$/).max(20).allow(''),
    gender: Joi.string().valid('Male', 'Female', 'Other', ''),
    birthDate: Joi.date().max('now').allow(null, ''),
    country: Joi.string().max(100).allow(''),
    city: Joi.string().max(100).allow(''),
    tags: Joi.array().items(Joi.string().max(50)),
    customFields: Joi.object()
  }),

  bulkImport: Joi.object({
    subscribers: Joi.array().items(
      Joi.object({
        email: commonValidations.email,
        firstName: Joi.string().max(100).allow('', null).trim(),
        lastName: Joi.string().max(100).allow('', null).trim(),
        phone: commonValidations.phone,
        company: Joi.string().max(100).allow('', null).trim(),
        city: Joi.string().max(100).allow('', null).trim(),
        country: Joi.string().max(100).allow('', null).trim(),
        gender: Joi.string().max(20).allow('', null).trim(),
        status: Joi.string().max(20).allow('', null).trim(),
        tags: Joi.array().items(Joi.string().max(50)),
        categories: Joi.string().allow('', null)
      })
    ).min(1).max(1000).required(),
    overwrite: Joi.boolean().default(false),
    targetCategoryId: Joi.number().integer().allow(null).optional()
  })
};

// 群組驗證規則
const groupValidations = {
  create: Joi.object({
    groupName: Joi.string().min(1).max(100).required(),
    description: Joi.string().max(500),
    criteria: Joi.object().required()
  }),

  update: Joi.object({
    groupName: Joi.string().min(1).max(100),
    description: Joi.string().max(500),
    criteria: Joi.object()
  })
};

// EDM驗證規則
const templateValidations = {
  create: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    subject: Joi.string().min(1).max(255).required(),
    htmlContent: Joi.string().required(),
    textContent: Joi.string(),
    templateType: Joi.string().valid('email', 'sms', 'push').default('email')
  }),

  update: Joi.object({
    name: Joi.string().min(1).max(100),
    subject: Joi.string().min(1).max(255),
    htmlContent: Joi.string(),
    textContent: Joi.string(),
    templateType: Joi.string().valid('email', 'sms', 'push'),
    isActive: Joi.boolean()
  }),

  import: Joi.object({
    templateData: Joi.object({
      name: Joi.string().min(1).max(100).required(),
      subject: Joi.string().min(1).max(255).required(),
      htmlContent: Joi.string().required(),
      textContent: Joi.string(),
      templateType: Joi.string().valid('email', 'sms', 'push').default('email')
    }).required(),
    name: Joi.string().min(1).max(100)
  })
};

// 活動驗證規則
const campaignValidations = {
  create: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    subject: Joi.string().min(1).max(255).required(),
    previewText: Joi.string().max(255).allow(''),
    senderName: Joi.string().min(1).max(100).required(),
    senderEmail: commonValidations.email,
    replyTo: Joi.string().email().max(255).allow(''),
    templateId: Joi.string().allow(null, '').optional(),
    htmlContent: Joi.string().required(),
    textContent: Joi.string().allow(''),
    type: Joi.string().valid('Regular', 'AB_Test', 'Automated', 'Transactional', 'Newsletter', 'Promotional', 'newsletter', 'promotional').default('Regular'),
    scheduledAt: Joi.date().allow(null).optional().messages({ 'date.base': '預約發送時間必須是有效的日期格式' }),
    recipientGroups: Joi.array().items(Joi.string().min(1)).min(0).default([]),
    recipientEmails: Joi.array().items(Joi.string().email().max(255)).min(0).default([]),
    status: Joi.string().valid('draft', 'pending_approval', 'approved', 'rejected', 'scheduled', 'sending', 'sent', 'cancelled').optional(),
    requires_approval: Joi.boolean().optional(),
    targetAudience: Joi.string().valid('all', 'active', 'category', 'custom').optional(),
    targetFilter: Joi.alternatives().try(Joi.string().allow(''), Joi.object().unknown()).allow(null).optional(),
    trackOpens: Joi.boolean().default(true),
    trackClicks: Joi.boolean().default(true),
    includeUnsubscribe: Joi.boolean().default(true)
  }).custom((value, helpers) => {
    // 確保至少有一個受眾群組或郵件地址
    if ((!value.recipientGroups || value.recipientGroups.length === 0) && 
        (!value.recipientEmails || value.recipientEmails.length === 0)) {
      // 如果都沒有，設置默認的 all_subscribers 群組
      value.recipientGroups = ['all_subscribers'];
    }
    return value;
  }),

  update: Joi.object({
    name: Joi.string().min(1).max(100),
    subject: Joi.string().min(1).max(255),
    previewText: Joi.string().max(255).allow(''),
    senderName: Joi.string().min(1).max(100),
    senderEmail: commonValidations.email,
    replyTo: Joi.string().email().max(255).allow(''),
    htmlContent: Joi.string(),
    textContent: Joi.string().allow(''),
    scheduledAt: Joi.date().allow(null).messages({ 'date.base': '預約發送時間必須是有效的日期格式' }),
    templateId: Joi.string().allow(null, '').optional(),
    priority: Joi.string().valid('normal', 'high', 'urgent'),
    targetAudience: Joi.string().valid('all', 'active', 'category', 'custom').optional(),
    type: Joi.string().valid('Regular', 'AB_Test', 'Automated', 'Transactional', 'Newsletter', 'Promotional', 'newsletter', 'promotional').optional(),
    status: Joi.string().valid('draft', 'pending_approval', 'approved', 'rejected', 'scheduled', 'sending', 'sent', 'cancelled').optional(),
    targetFilter: Joi.alternatives().try(Joi.string().allow(''), Joi.object().unknown()).allow(null).optional(),
    trackOpens: Joi.boolean().optional(),
    trackClicks: Joi.boolean().optional(),
    includeUnsubscribe: Joi.boolean().optional(),
    recipientGroups: Joi.array().items(Joi.string().min(1)).min(0).optional()
  }),

  send: Joi.object({
    sendNow: Joi.boolean().default(false),
    scheduledAt: Joi.date().min('now'),
    testEmails: Joi.array().items(commonValidations.email)
  })
};

// 查詢參數驗證
// 先定義分頁驗證
const paginationValidation = Joi.object({
  page: commonValidations.pagination.page,
  limit: commonValidations.pagination.limit,
  sortBy: commonValidations.pagination.sortBy,
  sortOrder: commonValidations.pagination.sortOrder
});

const queryValidations = {
  pagination: paginationValidation,

  subscriberFilter: Joi.object({
    status: Joi.string().valid('active', 'inactive', 'unsubscribed', 'bounced', 'complained', 'invalid').allow(''),
    category_ids: Joi.string().pattern(/^[\d,]*$/).allow(''),
    tags: Joi.string().max(200).allow(''),
    country: Joi.string().max(100).allow(''),
    city: Joi.string().max(100).allow(''),
    search: Joi.string().max(100).allow(''),
    page: commonValidations.pagination.page,
    limit: commonValidations.pagination.limit,
    sortBy: Joi.string().valid('id', 'email', 'first_name', 'last_name', 'company', 'created_at', 'updated_at', 'subscribed_at', 'status').default('created_at'),
    sortOrder: commonValidations.pagination.sortOrder,
    startDate: Joi.string().isoDate().allow(''),
    endDate: Joi.string().isoDate().allow(''),
    gender: Joi.string().valid('male', 'female', 'other', 'all', '').allow(''),
    birthdayMonth: Joi.alternatives().try(Joi.number().min(1).max(12), Joi.string().valid('all', '')),
    categoryGroup: Joi.string().max(50).allow(''),
    direction: Joi.string().valid('asc', 'desc')
  }),

  campaignFilter: Joi.object({
    status: Joi.string().valid('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled', 'Draft', 'Scheduled', 'Sending', 'Sent', 'Paused', 'Cancelled', 'completed', 'failed', 'pending_approval', 'all', '').allow(''),
    type: Joi.string().valid('Regular', 'AB_Test', 'Automated', 'Transactional', 'newsletter', 'promotional', 'transactional', 'automated', 'regular', 'ab_test', 'all', '').allow(''),
    search: Joi.string().max(100).allow(''),
    dateFrom: Joi.date().allow(''),
    dateTo: Joi.date().min(Joi.ref('dateFrom')).allow('')
  }).concat(paginationValidation),

  templateFilter: Joi.object({
    templateType: Joi.string().max(50),
    isActive: Joi.string().valid('true', 'false'),
    search: Joi.string().max(100)
  }).concat(paginationValidation)
};

// 分類驗證規則
const categoryValidations = {
  create: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    categoryType: Joi.string().max(50).required(),
    hierarchyType: Joi.string().max(50).required(),
    parentId: Joi.alternatives().try(Joi.string(), Joi.number()).allow(null, '').optional(),
    sortOrder: Joi.number().integer().default(0),
    description: Joi.string().max(500).allow('').optional(),
    image_url: Joi.string().max(500).allow('').optional(),
    isActive: Joi.boolean().default(true)
  }),

  update: Joi.object({
    name: Joi.string().min(1).max(100),
    categoryType: Joi.string().max(50),
    sortOrder: Joi.number().integer(),
    description: Joi.string().max(500).allow(''),
    isActive: Joi.boolean()
  })
};

module.exports = {
  validate,
  userValidations,
  subscriberValidations,
  groupValidations,
  templateValidations,
  campaignValidations,
  queryValidations,
  commonValidations,
  categoryValidations
};