# karin-plugin-steam

> 查询Steam好友的工具
> 
> 在qq里快速查看steam好友状态，康康你的kun友是否在玩h油
> 
> 查看好友列表，康康都在play什么
> 
> 合理使用，小心好朋友变朋友 `开隐私以后还怎么看！`

## 使用方法
```txt
git clone https://github.com/ycxom/karin-plugin-steam
pnpm i 
```
打开你的steam，点开`个人资料`，看到上面的链接

点开你的`好友列表`-右键-选择`查看个人资料`

|   链接为      | xxx为 |
| :---        |         ---: |
| https://steamcommunity.com/id/xxx/        | 自定义URL   |
| https://steamcommunity.com/profiles/xxx   | steamID   |
> /id/的是进入`设置`-`编辑个人资料`-`自定义URL`
> 
> 否则默认为/profiles/`steamID`
### 功能列表

- #### 发送`#Steam帮助`获取菜单

|   支持类型      | steamID | 自定义URL | 好友代码 |
| :---            |    --- |  ---      |    ---: |
|  #查询Steam       | ✅ | ✅ | ✅ |
|  #查询steam好友   | ✅ | ✅ | ✅ |
|  #绑定steam       | ✅ | ✅ | ✅ |
|  #查询steam好友   | ✅ | ✅ | ✅ |

- ### 绑定SteamID后可用 
- #查看我的Steam 
- #解绑Steam
- #steam加入群聊
- #steam退出群聊
- #查看群聊steam

- ### 管理员以上
- #启动steam播报
- #关闭steam播报
- #启动Steam喜加一播报
- #关闭Steam喜加一播报

- ### 主人权限
- #启动steam播报功能 
- #关闭steam播报功能


~~目前绑定部分有BUG，仅 #查询Steam好友，#查询Steam 可用~~

### 咕咕咕功能
- [x] 群聊内Stem播报
- [x] 查看我的好友列表
- [x] Steam喜加一