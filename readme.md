# B站粉丝勋章查询 (get-biliuser-medals)

适用于 [Koishi](https://koishi.chat) 的B站粉丝勋章查询插件，支持文本和图片两种显示模式。

![示例图片](https://s11.ax1x.com/2024/03/31/pFgVzjA.png)

## 功能特点

- 查询B站用户的所有粉丝勋章
- 查询指定UP主的粉丝勋章
- 支持文本和图片两种显示模式
- 图片模式下显示精美的粉丝勋章卡片，包含完整信息
- 显示勋章等级、亲密度、今日亲密度上限等详细信息
- 显示UP主头像、直播状态等信息
- 支持大航海等级显示（总督/提督/舰长）
- 自动检测"仅展示佩戴中的粉丝勋章"设置

## 安装方法

### 前置要求

- 安装 [Koishi](https://koishi.chat)
- 如需图片模式，请安装 `canvas` 插件

### 安装步骤

1. 在 Koishi 插件市场中搜索并安装 `get-biliuser-medals`
2. 如需图片模式，请同时安装 `canvas` 插件
3. 配置插件（需要填写B站的SESSDATA）
4. 重启 Koishi

## 使用方法

### 基本命令

```
getmedals <用户UID>         # 查询指定用户的所有粉丝勋章
getmedals <用户UID> -i      # 以图片形式查询指定用户的所有粉丝勋章
getmedals <用户UID> <UP主UID>  # 查询指定用户拥有的特定UP主的粉丝勋章
getmedals <用户UID> <UP主UID> -i  # 以图片形式查询指定用户拥有的特定UP主的粉丝勋章
getmedals.help            # 查看帮助信息
```

### 示例

```
getmedals 114514              # 查询UID为114514的用户的所有粉丝勋章
getmedals 114514 -i           # 以图片形式查询UID为114514的用户的所有粉丝勋章
getmedals 114514 1919810      # 查询UID为114514的用户拥有的UID为1919810的UP主的粉丝勋章
getmedals 114514 1919810 -i   # 以图片形式查询...
```

## 配置说明

| 配置项 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| SESSDATA | string | - | B站的SESSDATA，用于API认证 |
| debugMode | boolean | false | 开启调试模式，将输出更详细的日志信息 |
| blacklistUIDs | string[] | [] | 禁止查询列表，这些用户的粉丝勋章信息将无法被查询 |
| imageBackground | string | #ffffff | 图片背景颜色（十六进制色值） |
| imageWidth | number | 500 | 渲染图片的宽度(像素)，范围300-1000 |

### 如何获取SESSDATA

1. 登录B站网页版
2. 按F12打开开发者工具
3. 切换到Application(应用程序)或Storage(存储)选项卡
4. 在左侧找到Cookies，然后找到bilibili.com
5. 在右侧列表中找到名为SESSDATA的cookie，其值即为所需的SESSDATA

## 注意事项

1. 必须填写有效的SESSDATA才能查询粉丝勋章信息
2. SESSDATA有过期时间，过期后需要重新获取并更新
3. 图片模式需要安装并正确配置`canvas`插件
4. 用户设置为不公开的粉丝勋章无法被查询
5. 如果用户设置了"仅展示佩戴中的粉丝勋章"，将只能看到当前佩戴的勋章
6. 请勿频繁查询，以免触发B站的API限制

## 问题反馈

如有问题或建议，请前往[GitHub仓库](https://github.com/WittF/koishi-plugin-get-biliuser-medals)提交Issue。

## 许可证

MIT License 