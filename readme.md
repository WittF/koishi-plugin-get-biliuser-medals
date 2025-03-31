# B站粉丝勋章查询 (get-biliuser-medals)

适用于 [Koishi](https://koishi.chat) 的B站粉丝勋章查询插件，支持文本和图片两种显示模式。

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
getmedals 686127              # 查询UID为686127的用户的所有粉丝勋章
getmedals 686127 -i           # 以图片形式查询UID为686127的用户的所有粉丝勋章
getmedals 686127 686127      # 查询UID为686127的用户拥有的UID为686127的UP主的粉丝勋章
getmedals 686127 686127 -i   # 以图片形式查询...
```

## 许可证

MIT License 
