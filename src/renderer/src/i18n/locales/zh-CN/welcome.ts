/**
 * 欢迎引导页命名空间（`welcome`）：标题 / 说明 / 笔名步骤文案。
 * `penName.tooLong` 含两个插值参数：`count`（已输入字数）与 `max`（建议上限）。
 */
const welcome = {
  title: "欢迎使用 Writer's Forge",
  desc: '起一个想长期使用的署名，它会出现在你的作品与界面上。',
  start: '开始使用',
  penName: {
    label: '笔名',
    hint: '仅用于署名，之后可随时修改。',
    errorRequired: '请输入笔名后再继续。',
    placeholder: '例如：山中客',
    tooLong: '已输入 {{count}} 字，建议精简到 {{max}} 字以内。'
  }
}

export default welcome
