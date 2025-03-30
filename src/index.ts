import { Context, Schema, h, Session } from 'koishi'
import axios from 'axios'
import * as path from 'path'
import * as fs from 'fs/promises'

export const name = 'get-biliuser-medals'

export interface Config {
  SESSDATA: string
}

export const Config: Schema<Config> = Schema.object({
  SESSDATA: Schema.string()
    .description('B站的SESSDATA，用于API认证')
    .required(),
})

// 勋章信息接口
interface MedalInfo {
  target_id: number
  level: number
  medal_name: string
  medal_color_start: number
  medal_color_end: number
  medal_color_border: number
  guard_level: number
  wearing_status: number
  medal_id: number
  intimacy: number
  next_intimacy: number
  today_feed: number
  day_limit: number
  guard_icon: string
  honor_icon: string
}

// 用户勋章信息接口
interface UinfoMedal {
  name: string
  level: number
  color_start: number
  color_end: number
  color_border: number
  color: number
  id: number
  typ: number
  is_light: number
  ruid: number
  guard_level: number
  score: number
  guard_icon: string
  honor_icon: string
  v2_medal_color_start: string
  v2_medal_color_end: string
  v2_medal_color_border: string
  v2_medal_color_text: string
  v2_medal_color_level: string
  user_receive_count: number
}

// 勋章列表项接口
interface MedalListItem {
  medal_info: MedalInfo
  target_name: string
  target_icon: string
  link: string
  live_status: number
  official: number
  uinfo_medal: UinfoMedal
}

// API响应接口
interface APIResponse {
  code: number
  message: string
  ttl: number
  data?: {
    list: MedalListItem[]
    count: number
    close_space_medal: number
    only_show_wearing: number
    name: string
    icon: string
    uid: number
    level: number
  }
}

export function apply(ctx: Context, config: Config) {
  // 创建数据目录
  const dataDir = path.join(ctx.baseDir, 'data', 'biliuser-medals')
  fs.mkdir(dataDir, { recursive: true }).catch(err => {
    ctx.logger('get-biliuser-medals').error(`创建数据目录失败: ${err.message}`)
  })

  // 格式化粉丝勋章信息
  const formatMedalInfo = (medals: MedalListItem[], isSingleUp = false): string => {
    let result = ''
    
    medals.forEach((item, index) => {
      const medal = item.medal_info
      const uinfoMedal = item.uinfo_medal
      
      // 直播状态
      const liveStatus = item.live_status === 1 ? '🔴 直播中' : 
                         item.live_status === 2 ? '🔄 轮播中' : '⚫ 未直播'
      
      // 大航海等级
      let guardLevel = ''
      if (medal.guard_level === 1) guardLevel = '👑 总督'
      else if (medal.guard_level === 2) guardLevel = '🏆 提督'
      else if (medal.guard_level === 3) guardLevel = '🚢 舰长'
      
      // 佩戴状态
      const wearing = medal.wearing_status === 1 ? '【已佩戴】' : ''
      
      // 使用文本格式返回勋章信息
      if (isSingleUp) {
        // 指定UP主时不显示编号
        result += `${wearing}【${medal.medal_name}】 LV.${medal.level} ${guardLevel}\n`
      } else {
        // 多个UP主时显示编号
        result += `${index + 1}. ${wearing}【${medal.medal_name}】 LV.${medal.level} ${guardLevel}\n`
      }
      
      result += `   UP主: ${item.target_name} ${liveStatus}\n`
      result += `   亲密度: ${medal.intimacy}/${medal.next_intimacy} (今日 ${medal.today_feed}/${medal.day_limit})\n`
      result += `   状态: ${medal.wearing_status === 1 ? '✅ 已点亮' : '❌ 未点亮'}\n\n`
    })
    
    return result
  }

  // 获取用户粉丝勋章
  const getMedals = async (uid: string): Promise<APIResponse> => {
    try {
      const response = await axios.get('https://api.live.bilibili.com/xlive/web-ucenter/user/MedalWall', {
        params: {
          target_id: uid
        },
        headers: {
          Cookie: `SESSDATA=${config.SESSDATA}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      })
      return response.data
    } catch (error) {
      ctx.logger('get-biliuser-medals').error(`获取粉丝勋章失败: ${error.message}`)
      throw new Error('获取粉丝勋章失败，请检查UID是否正确或登录状态')
    }
  }

  // 封装发送消息的函数，处理私聊和群聊的不同格式
  const sendMessage = async (session: Session, content: any[]) => {
    try {
      // 处理私聊和群聊的消息格式
      const promptMessage = session.channelId.startsWith('private:')
        ? [h.quote(session.messageId), ...content]
        : [h.quote(session.messageId), h.at(session.userId), '\n', ...content]

      await session.send(promptMessage)
    } catch (error) {
      ctx.logger('get-biliuser-medals').error(`发送消息失败: ${error.message}`)
    }
  }

  // 注册getmedals命令
  ctx.command('getmedals <uid:string> [upUid:string]', '获取B站用户粉丝勋章信息，可选参数：UP主UID')
    .action(async ({ session }, uid, upUid) => {
      if (!uid) {
        await sendMessage(session, [h.text('请提供正确的B站UID')])
        return
      }

      try {
        const response = await getMedals(uid)
        
        if (response.code !== 0) {
          await sendMessage(session, [h.text(`获取勋章失败: ${response.message || '未知错误'} (错误码: ${response.code})`)])
          return
        }
        
        if (!response.data) {
          await sendMessage(session, [h.text('获取勋章失败: 返回数据为空')])
          return
        }
        
        let { list, count, name } = response.data
        
        // 如果指定了UP主UID，则筛选对应UP主的勋章
        if (upUid) {
          const upUidNum = Number(upUid)
          const originalCount = list.length
          list = list.filter(item => item.medal_info.target_id === upUidNum)
          
          if (list.length === 0) {
            await sendMessage(session, [h.text(`用户 ${name}(${uid}) 没有UP主 ${upUid} 的粉丝勋章`)])
            return
          }
          
          count = list.length
          const upName = list[0].target_name
          await sendMessage(session, [
            h.text(`用户 ${name}(${uid}) 的UP主 ${upName}(${upUid}) 粉丝勋章:\n\n`),
            h.text(formatMedalInfo(list, true)) // 指定UP主时传入true
          ])
          return
        }
        
        if (count === 0 || !list.length) {
          await sendMessage(session, [h.text(`用户 ${name}(${uid}) 没有粉丝勋章`)])
          return
        }
        
        const medalInfo = formatMedalInfo(list, false) // 未指定UP主时传入false
        
        // 生成预览文本并发送
        await sendMessage(session, [
          h.text(`用户 ${name}(${uid}) 的粉丝勋章 (共${count}个):\n\n`),
          h.text(medalInfo)
        ])
      } catch (error) {
        ctx.logger('get-biliuser-medals').error(`处理请求失败: ${error.message}`)
        await sendMessage(session, [h.text(`获取勋章失败: ${error.message}`)])
      }
    })
}
