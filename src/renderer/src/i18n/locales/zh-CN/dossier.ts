/**
 * 设定档案五域命名空间（`dossier`）：世界观 / 角色 / 势力 / 境界体系 / 物品功法五模块共享的
 * 界面文案（卡片网格、新建弹窗、右栏详情编辑）。
 *
 * 域名词（世界观 / 角色 / …）取自 `module` 命名空间（键即模块 id），
 * 本 ns 文案以 `{{module}}` 插值复用（如 `t('createAction', { module })`），
 * 避免为五域各写一套平行文案。
 *
 * 不译项：卡片标题 / 简介 / 正文、关系对端名与关系说明、体系类型名称
 * 与自定义属性名值均为**用户数据**，不在此列。
 */
const dossier = {
  gridAria: '{{module}}卡片列表',
  countLabel: '共 {{total}} 条',
  unnamed: '未命名',
  /** 历史未分类数据（`subtype_id = NULL`）的占位文案；不提供回选入口。 */
  subTypeUncategorized: '未分类',
  /** 类别必填提示（新建 / 编辑弹窗共用）。 */
  subTypeRequired: '请选择类别',
  emptyTitle: '还没有{{module}}',
  emptyDesc: '点标题栏左上角的加号新建第一条',
  createAction: '新建{{module}}',
  createDialog: {
    title: '新建{{module}}',
    nameLabel: '名称',
    namePlaceholder: '输入名称',
    subTypeLabel: '子类',
    subTypePlaceholder: '选择或新增子类',
    addSubType: '新增分类',
    addSubTypePlaceholder: '输入新分类名',
    deleteSubType: '删除分类',
    deleteSubTypeTitle: '删除分类',
    deleteSubTypeMessage: '确定删除自定义分类「{{name}}」？该分类下的 {{count}} 条条目将被删除。',
    deleteSubTypeDisabled: '默认分类不可删除'
  },
  cardEmptyDesc: '暂无简介',
  editAction: '编辑',
  /** 卡片「关联关系」按钮（aria-label / title）。 */
  relationsAction: '关联关系',
  editDialog: {
    title: '编辑{{module}}',
    nameLabel: '名称',
    namePlaceholder: '输入名称',
    subTypeLabel: '类别',
    aliasesLabel: '别名',
    aliasesPlaceholder: '输入别名',
    addAlias: '添加别名'
  },
  /** 关联关系独立弹窗（标题 + 分区标题）。 */
  relationsDialog: {
    title: '关联关系'
  },
  view: {
    uncategorized: '未分类'
  },
  dialog: {
    /** 右栏有未保存改动时切换条目：两态确认（保存并切换 / 不保存）。 */
    unsavedSwitch: {
      title: '有未保存的改动',
      message:
        '当前条目的改动尚未保存。点「保存」先落库再继续，点「不保存」放弃这些改动直接继续。',
      discard: '不保存'
    }
  },
  detail: {
    emptyTitle: '未选中{{module}}',
    emptyDesc: '在左侧点选一张卡片，即可查看详情',
    emptyValue: '暂无',
    /** 右栏上段无子类字段时的空态（角色 / 未分类条目）。 */
    noSubtypeFields: '暂无可填写的子类专属字段',
    nameLabel: '名称',
    namePlaceholder: '输入名称',
    subTypeLabel: '子类',
    subTypePlaceholder: '选择或新增子类',
    gradeLabel: '品阶',
    gradePlaceholder: '如：上品',
    rankLabel: '档位',
    rankPlaceholder: '如：3',
    /** 境界体系唯一专属字段（`world_power_system.kind`）。 */
    powerKindLabel: '体系类型',
    powerKindPlaceholder: '如：线性 / 多途径 / 果位',
    aliasesLabel: '别名',
    aliasesPlaceholder: '输入别名',
    addAlias: '添加别名',
    bodyLabel: '正文',
    bodyPlaceholder: '填写详细设定…',
    tagsLabel: '标签',
    tagsPlaceholder: '回车或逗号添加标签',
    relationsEmpty: '暂无关系',
    addRelation: '添加关系',
    relation: {
      moduleLabel: '模块',
      modulePlaceholder: '选择模块',
      categoryLabel: '类别',
      categoryPlaceholder: '选择类别',
      categoryAll: '全部',
      targetLabel: '具体项目',
      targetSearchPlaceholder: '输入名称搜索具体项目',
      typeLabel: '关系类型',
      typePlaceholder: '选择关系类型',
      /** 角色 → 物品时提示自动反向存储。 */
      reverseHint: '将记录为：物品属于角色',
      custom: '自定义关系',
      noteLabel: '备注',
      notePlaceholder: '备注（可选）',
      edit: '编辑关系',
      collapse: '收起编辑',
      incomingTitle: '被引用',
      incomingEmpty: '暂无被引用关系',
      /** 「被引用」区说明：关系由对方发起，可改可删，但关联对象只读。 */
      incomingHint: '这些关系由对方条目发起：可改类型 / 备注，或删除；关联对象只读。',
      /** 入边类型下拉提示：语义码仍读「对方 → 我」。 */
      incomingTypeHint:
        '类型按「对方 → 我」记录：选「上级」即对方是我的上级，选「属于」即对方属于我。',
      /** 删除关系二次确认（出边 / 入边共用，`name` 为对端名称）。 */
      removeMessage: '确定删除与「{{name}}」的这条关系？删除后不可恢复。',
      /** 胶囊删除按钮的无障碍标签（`name` 为对端名称）。 */
      removePill: '移除与「{{name}}」的关系'
    },
    removeRelation: '删除关系',
    delete: '删除',
    deleteTitle: '删除{{module}}',
    deleteMessage: '确定删除「{{name}}」？其别名、标签与关系将一并移除，此操作不可恢复。',
    worldviewFields: {
      era: '时代/纪元',
      scale: '规模',
      population: '人口',
      epoch: '纪元名',
      coordinates: '坐标',
      climate: '气候',
      area: '面积',
      terrain: '地形',
      language: '语言',
      customs: '习俗',
      religion: '宗教',
      art: '艺术',
      lifespan: '寿命',
      body_size: '体型',
      reproduction: '繁衍',
      habits: '习性',
      currency: '货币',
      tax_rate: '税率',
      trade_routes: '贸易路线',
      resources: '资源',
      physics: '物理法则',
      magic: '魔法法则',
      taboo: '禁忌',
      boundary: '边界'
    },
    itemFields: {
      attack: '攻击力',
      durability: '耐久',
      weight: '重量',
      material: '材质',
      tier: '品阶',
      practice: '修炼方式',
      cost: '消耗',
      requirement: '修炼条件',
      effect: '药效',
      side_effect: '副作用',
      difficulty: '炼制难度',
      shelf_life: '保质期',
      talent_type: '天赋类型',
      awaken_condition: '觉醒条件',
      growth: '成长性',
      limitation: '限制',
      defense: '防御力',
      slot: '部位',
      set_bonus: '套装',
      usage: '用途',
      grade_label: '品级',
      origin: '产地',
      reserve: '储量'
    },
    factionFields: {
      gate: '山门',
      disciples: '弟子数',
      heritage: '功法传承',
      precepts: '戒律',
      patriarch: '族长',
      family_rules: '家规',
      bloodline: '血脉',
      ancestral_teaching: '祖训',
      territory: '疆域',
      law: '律法',
      army: '军队',
      capital: '都城',
      business: '经营范围',
      funds: '资金',
      branches: '分号',
      reputation: '信誉',
      form: '组织形式',
      members: '成员数',
      goal: '目标',
      freedom: '自由度',
      doctrine: '教义',
      ritual: '仪式',
      taboo: '禁忌',
      sphere: '势力范围'
    },
    customFields: {
      title: '自定义字段',
      empty: '还没有自定义字段，点击下方按钮添加',
      hint: '最多 64 条，字段名 64 字符内，字段值 2000 字符内；点右栏底部「保存」落库',
      key: '字段名',
      keyPlaceholder: '如：品阶',
      value: '字段值',
      valuePlaceholder: '如：上品',
      add: '添加字段',
      remove: '删除字段'
    }
  }
}

export default dossier
