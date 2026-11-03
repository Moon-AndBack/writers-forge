export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 中文正文常出现长行，默认 100 字符会让每次提交都报错，这里放宽（severity 0 即关闭该规则）。
    'body-max-line-length': [0, 'always', 0]
  }
}
