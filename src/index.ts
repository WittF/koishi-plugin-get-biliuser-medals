import { Context, Schema, h, Session, Logger } from 'koishi'
import axios from 'axios'
import * as path from 'path'
import * as fs from 'fs/promises'

export const name = 'get-biliuser-medals'

export interface Config {
  SESSDATA: string
  debugMode: boolean
  blacklistUIDs: string[]
  imageBackground: string
  imageWidth: number
}

export const Config: Schema<Config> = Schema.object({
  SESSDATA: Schema.string()
    .description('B站的SESSDATA，用于API认证')
    .required(),
  debugMode: Schema.boolean()
    .description('开启调试模式，将输出更详细的日志信息')
    .default(false),
  blacklistUIDs: Schema.array(Schema.string())
    .description('禁止查询列表，这些用户的粉丝勋章信息将无法被查询')
    .default([]),
  imageBackground: Schema.string()
    .description('图片背景颜色（十六进制色值，如#ffffff)')
    .default('#ffffff'),
  imageWidth: Schema.number()
    .description('渲染图片的宽度(像素)，默认为500')
    .min(300)
    .max(1000)
    .default(500),
})

// 声明插件必需依赖
export const inject = {
  required: ['canvas'],
}

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
  data?: {
    icon?: string  // 用户头像URL
    uid?: number   // 用户UID
    name?: string  // 用户名称
  }
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

// 声明Skia Canvas插件接口
declare module 'koishi' {
  interface Context {
    canvas?: {
      createCanvas(width: number, height: number): any
      loadFont(name: string, path: string): void
      registerFont(path: string, options?: { family?: string }): void
      loadImage(buffer: Buffer | string): Promise<any>
    }
  }
}

export function apply(ctx: Context, config: Config) {
  // 创建日志记录器
  const logger = new Logger('get-biliuser-medals')

  // 记录日志的辅助函数
  const log = {
    debug: (message: string, ...args: any[]) => {
      if (config.debugMode) {
        logger.debug(message, ...args)
      }
    },
    info: (message: string, ...args: any[]) => {
      logger.info(message, ...args)
    },
    warn: (message: string, ...args: any[]) => {
      logger.warn(message, ...args)
    },
    error: (message: string, error?: any) => {
      if (config.debugMode && error) {
        if (error instanceof Error) {
          logger.error(`${message}: ${error.message}`)
          logger.error(`Stack: ${error.stack}`)
        } else {
          logger.error(`${message}: ${JSON.stringify(error)}`)
        }
      } else {
        logger.error(message)
      }
    }
  }

  // 在启动时记录基本信息
  log.info(`插件已启动 ${config.debugMode ? '(调试模式已开启)' : ''}`)
  log.debug('插件配置:', JSON.stringify(config, null, 2))

  // canvas是必需依赖，确保可用
  log.info('canvas插件已加载，支持图片渲染模式')

  // 创建数据目录
  const dataDir = path.join(ctx.baseDir, 'data', 'biliuser-medals')
  fs.mkdir(dataDir, { recursive: true }).catch(err => {
    log.error(`创建数据目录失败: ${err.message}`, err)
  })

  // 图标路径 - 使用相对路径，但不假设src目录
  const iconDir = path.join(ctx.baseDir, 'external', 'get-biliuser-medals', 'icon')

  // 格式化粉丝勋章信息为文本
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
      
      result += `   UP主: ${item.target_name} 状态：${liveStatus.replace(/[\(\)]/g, '')}\n`
      result += `   亲密度: ${medal.intimacy}/${medal.next_intimacy} (今日 ${medal.today_feed}/${medal.day_limit})\n`
      result += `   状态: ${medal.wearing_status === 1 ? '✅ 已点亮' : '❌ 未点亮'}\n\n`
    })
    
    return result
  }

  // 十进制颜色转十六进制
  const decimalToHex = (decimal: number): string => {
    return `#${decimal.toString(16).padStart(6, '0')}`
  }

  // 使用canvas渲染粉丝勋章图片
  const renderMedalsImage = async (
    medals: MedalListItem[],
    userName: string,
    userId: string,
    count: number,
    upName?: string,
    upUid?: string,
    userIcon?: string
  ): Promise<string> => {
    if (!ctx.canvas) {
      throw new Error('canvas插件不可用')
    }

    try {
      const canvas = ctx.canvas
      // 计算画布高度：标题高度 + 每个勋章的高度
      const titleHeight = 80 // 增加标题高度，为用户头像留出空间
      const medalHeight = 120
      const padding = 20
      const width = config.imageWidth
      
      // 添加可能的底部提示区域高度
      const footerHeight = count === 1 ? 40 : 0
      const height = titleHeight + (medals.length * medalHeight) + (padding * 2) + footerHeight

      // 创建画布
      const canv = canvas.createCanvas(width, height)
      const context = canv.getContext('2d')

      // 设置背景
      context.fillStyle = config.imageBackground
      context.fillRect(0, 0, width, height)

      // 设置标题区域
      context.fillStyle = '#f5f5f5'
      context.fillRect(0, 0, width, titleHeight)

      // 用户头像是否加载成功的标志
      let avatarLoaded = false;
      let avatarX = padding;
      const avatarSize = 56;

      // 加载并绘制用户头像
      try {
        // 优先使用传入的userIcon参数
        const userIconUrl = userIcon || '';
        
        if (userIconUrl) {
          log.debug(`尝试加载用户头像: ${userIconUrl}`);
          
          // 下载头像
          const iconResponse = await axios.get(userIconUrl, { 
            responseType: 'arraybuffer',
            timeout: 10000 // 增加超时时间到10秒
          });
          
          const img = await canvas.loadImage(Buffer.from(iconResponse.data));
          avatarX = padding;
          const avatarY = (titleHeight - avatarSize) / 2;
          
          // 绘制圆形头像
          context.save();
          context.beginPath();
          context.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
          context.closePath();
          context.clip();
          
          context.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
          context.restore();
          
          // 标记头像加载成功
          avatarLoaded = true;
        } else {
          log.warn('用户头像URL不可用');
        }
      } catch (error) {
        log.warn('获取或绘制用户头像失败', error);
        // 头像获取失败不影响整体渲染
      }

      // 绘制标题文本
      context.fillStyle = '#333333';
      
      let titleText = '';
      if (upName && upUid) {
        titleText = `用户 ${userName}(${userId}) 的UP主 ${upName}(${upUid}) 粉丝勋章`;
      } else {
        titleText = `用户 ${userName}(${userId}) 的粉丝勋章 (共${count}个)`;
      }
      
      // 根据头像是否加载成功调整标题位置和字体大小
      if (avatarLoaded) {
        // 如果头像加载成功，将标题放在头像右侧
        const titleX = avatarX + avatarSize + 15; // 在头像右侧显示，留出一定间距
        const availableWidth = width - titleX - padding;
        
        // 设置初始字体大小
        let fontSize = 18; // 默认字体大小
        
        // 自适应调整字体大小，直到文本能完整显示
        let titleFits = false;
        while (!titleFits && fontSize > 12) { // 最小字体大小为12px
          context.font = `bold ${fontSize}px LXGW WenKai Lite`;
          const titleWidth = context.measureText(titleText).width;
          if (titleWidth <= availableWidth) {
            titleFits = true;
          } else {
            fontSize -= 1;
          }
        }

        // 计算头像右侧区域的垂直中点
        const titleY = titleHeight / 2 + 3;
        
        // 使标题在头像右侧区域居中显示
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        context.fillText(titleText, titleX, titleY, availableWidth);
      } else {
        // 如果头像加载失败，将标题居中显示
        context.font = 'bold 18px LXGW WenKai Lite'; // 默认字体大小
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(titleText, width / 2, titleHeight / 2);
      }

      // 循环绘制每个勋章
      for(let i = 0; i < medals.length; i++) {
        const item = medals[i]
        const medal = item.medal_info
        const startY = titleHeight + (i * medalHeight)
        const startColor = decimalToHex(medal.medal_color_start)
        const endColor = decimalToHex(medal.medal_color_end)
        const borderColor = decimalToHex(medal.medal_color_border)

        // 绘制勋章卡片背景
        context.fillStyle = '#f8f8f8'
        context.fillRect(padding, startY + padding, width - (padding * 2), medalHeight - padding)

        // 绘制左侧边框
        context.fillStyle = borderColor
        context.fillRect(padding, startY + padding, 4, medalHeight - padding)

        // 尝试加载并绘制主播头像
        try {
          if (item.target_icon) {
            const upIconSize = 36;
            const upIconX = width - padding - upIconSize - 10;
            const upIconY = startY + padding + 12;
            
            // 下载头像
            const response = await axios.get(item.target_icon, { 
              responseType: 'arraybuffer',
              timeout: 10000 // 增加超时时间到10秒
            });
            const img = await canvas.loadImage(Buffer.from(response.data));
            
            // 绘制圆形头像
            context.save();
            context.beginPath();
            context.arc(upIconX + upIconSize/2, upIconY + upIconSize/2, upIconSize/2, 0, Math.PI * 2);
            context.closePath();
            context.clip();
            
            context.drawImage(img, upIconX, upIconY, upIconSize, upIconSize);
            context.restore();
          }
        } catch (error) {
          log.warn(`获取或绘制UP主 ${item.target_name} 的头像失败`, error);
          // 头像获取失败不影响整体渲染
        }

        // 绘制勋章名称和等级 - 圆角矩形风格
        // 根据文本内容计算所需宽度
        context.font = 'bold 14px LXGW WenKai Lite';
        const textMetrics = context.measureText(medal.medal_name);
        // 计算所需的宽度 = 文本宽度 + 等级圆直径 + 左右内边距
        const textWidth = textMetrics.width;
        const levelRadius = 10; // 等级圆形半径，调小以避免与边缘重合
        const minWidth = 70; // 增加最小宽度，确保等级标识有足够空间
        const textPadding = 10; // 文本左侧内边距
        const rightPadding = 15; // 增加右侧间距，确保等级标识不会太靠近边缘
        // 计算勋章宽度，确保至少有最小宽度
        const medalWidth = Math.max(minWidth, textWidth + levelRadius * 2 + textPadding + rightPadding);

        const medalBoxHeight = 28;
        const medalX = padding + 20;
        const medalY = startY + padding + 15;
        const cornerRadius = 14; // 圆角半径

        // 保存当前绘图状态
        context.save();

        // 绘制圆角矩形路径
        context.beginPath();
        context.moveTo(medalX + cornerRadius, medalY);
        context.lineTo(medalX + medalWidth - cornerRadius, medalY);
        context.arcTo(medalX + medalWidth, medalY, medalX + medalWidth, medalY + cornerRadius, cornerRadius);
        context.lineTo(medalX + medalWidth, medalY + medalBoxHeight - cornerRadius);
        context.arcTo(medalX + medalWidth, medalY + medalBoxHeight, medalX + medalWidth - cornerRadius, medalY + medalBoxHeight, cornerRadius);
        context.lineTo(medalX + cornerRadius, medalY + medalBoxHeight);
        context.arcTo(medalX, medalY + medalBoxHeight, medalX, medalY + medalBoxHeight - cornerRadius, cornerRadius);
        context.lineTo(medalX, medalY + cornerRadius);
        context.arcTo(medalX, medalY, medalX + cornerRadius, medalY, cornerRadius);
        context.closePath();

        // 填充渐变背景
        const gradient = context.createLinearGradient(medalX, medalY, medalX + medalWidth, medalY);
        gradient.addColorStop(0, startColor);
        gradient.addColorStop(1, endColor);
        context.fillStyle = gradient;
        context.fill();

        // 绘制右侧圆形等级标识 - 固定合适位置
        const levelX = medalX + medalWidth - levelRadius - 8; // 固定与右边缘保持8px以上间距
        const levelY = medalY + medalBoxHeight / 2;

        // 绘制等级背景圆
        context.beginPath();
        context.arc(levelX, levelY, levelRadius, 0, Math.PI * 2);
        context.fillStyle = '#ffffff';
        context.fill();

        // 绘制等级文字
        context.fillStyle = startColor;
        context.font = 'bold 13px LXGW WenKai Lite';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(medal.level.toString(), levelX, levelY);

        // 绘制勋章名称
        context.fillStyle = '#ffffff';
        context.font = 'bold 14px LXGW WenKai Lite';
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        // 限制文本宽度，确保不与等级重叠
        const maxWidth = medalWidth - levelRadius * 2 - textPadding; // 减去等级圆的直径及左侧间距
        context.fillText(medal.medal_name, medalX + textPadding, medalY + medalBoxHeight / 2, maxWidth);

        // 恢复绘图状态
        context.restore();

        // 大航海等级 - 使用图标替代
        if (medal.guard_level > 0) {
          let guardIconFile = '';
          
          // 根据大航海等级设置不同的图标文件
          if (medal.guard_level === 1) {
            guardIconFile = 'guard_level1.png'; // 总督
          } else if (medal.guard_level === 2) {
            guardIconFile = 'guard_level2.png'; // 提督
          } else if (medal.guard_level === 3) {
            guardIconFile = 'guard_level3.png'; // 舰长
          }
          
          try {
            // 加载大航海图标 - 使用正确的目录路径
            const guardIconPath = path.join(iconDir, guardIconFile);
            log.debug(`尝试加载大航海图标: ${guardIconPath}`);
            
            // 尝试多个可能的路径来加载图标
            let guardIcon;
            try {
              // 首先尝试使用配置的路径
              guardIcon = await fs.readFile(guardIconPath);
              log.debug(`成功从路径加载图标: ${guardIconPath}`);
            } catch (pathError) {
              // 如果失败，尝试使用相对于插件目录的路径
              const pluginDir = path.resolve(__dirname, '..');
              const altIconPath = path.join(pluginDir, 'icon', guardIconFile);
              log.debug(`尝试从替代路径加载图标: ${altIconPath}`);
              
              try {
                guardIcon = await fs.readFile(altIconPath);
                log.debug(`成功从替代路径加载图标: ${altIconPath}`);
              } catch (altPathError) {
                // 如果还是失败，尝试直接从工作目录加载
                const workDirIconPath = path.join('icon', guardIconFile);
                log.debug(`尝试从工作目录加载图标: ${workDirIconPath}`);
                guardIcon = await fs.readFile(workDirIconPath);
              }
            }
            
            const img = await canvas.loadImage(guardIcon);
            
            // 设置图标位置和大小
            const guardX = medalX + medalWidth + 10;
            const guardY = medalY + (medalBoxHeight - 28) / 2; // 垂直居中
            const guardSize = 28; // 显示尺寸
            
            // 获取图片实际尺寸
            const imgWidth = img.width || 64;
            const imgHeight = img.height || 64;
            
            // 绘制图标 - 保持比例并居中显示，避免裁剪问题
            // 绘制图标 - 不裁剪，保持原始比例
            context.drawImage(img, guardX, guardY, guardSize, guardSize);
          } catch (error) {
            log.warn(`加载大航海图标失败: ${error.message}`, error);
            
            // 如果图标加载失败，退回到文字模式
            let guardColor = '';
            let guardText = '';
            
            if (medal.guard_level === 1) {
              guardColor = '#ff7f50'; // 总督-橙色
              guardText = '总督';
            } else if (medal.guard_level === 2) {
              guardColor = '#9370db'; // 提督-紫色
              guardText = '提督';
            } else if (medal.guard_level === 3) {
              guardColor = '#3498db'; // 舰长-蓝色
              guardText = '舰长';
            }
            
            // 移动大航海标识的位置
            const guardX = medalX + medalWidth + 10
            const guardY = medalY
            const guardWidth = 50
            
            // 绘制大航海标识背景
            context.save()
            context.beginPath()
            context.moveTo(guardX + cornerRadius, guardY)
            context.lineTo(guardX + guardWidth - cornerRadius, guardY)
            context.arcTo(guardX + guardWidth, guardY, guardX + guardWidth, guardY + cornerRadius, cornerRadius)
            context.lineTo(guardX + guardWidth, guardY + medalBoxHeight - cornerRadius)
            context.arcTo(guardX + guardWidth, guardY + medalBoxHeight, guardX + guardWidth - cornerRadius, guardY + medalBoxHeight, cornerRadius)
            context.lineTo(guardX + cornerRadius, guardY + medalBoxHeight)
            context.arcTo(guardX, guardY + medalBoxHeight, guardX, guardY + medalBoxHeight - cornerRadius, cornerRadius)
            context.lineTo(guardX, guardY + cornerRadius)
            context.arcTo(guardX, guardY, guardX + cornerRadius, guardY, cornerRadius)
            context.closePath()
            
            context.fillStyle = guardColor
            context.fill()
            
            // 绘制大航海文本
            context.fillStyle = '#ffffff'
            context.font = 'bold 14px LXGW WenKai Lite'
            context.textAlign = 'center'
            context.textBaseline = 'middle'
            context.fillText(guardText, guardX + guardWidth / 2, guardY + medalBoxHeight / 2)
            context.restore()
          }
        }

        // 佩戴状态
        if (medal.wearing_status === 1) {
          const wearingX = medalX + medalWidth + (medal.guard_level > 0 ? 50 : 10)
          const wearingY = medalY
          const wearingWidth = 60
          
          // 绘制佩戴标识背景
          context.save()
          context.beginPath()
          context.moveTo(wearingX + cornerRadius, wearingY)
          context.lineTo(wearingX + wearingWidth - cornerRadius, wearingY)
          context.arcTo(wearingX + wearingWidth, wearingY, wearingX + wearingWidth, wearingY + cornerRadius, cornerRadius)
          context.lineTo(wearingX + wearingWidth, wearingY + medalBoxHeight - cornerRadius)
          context.arcTo(wearingX + wearingWidth, wearingY + medalBoxHeight, wearingX + wearingWidth - cornerRadius, wearingY + medalBoxHeight, cornerRadius)
          context.lineTo(wearingX + cornerRadius, wearingY + medalBoxHeight)
          context.arcTo(wearingX, wearingY + medalBoxHeight, wearingX, wearingY + medalBoxHeight - cornerRadius, cornerRadius)
          context.lineTo(wearingX, wearingY + cornerRadius)
          context.arcTo(wearingX, wearingY, wearingX + cornerRadius, wearingY, cornerRadius)
          context.closePath()
          
          context.fillStyle = '#ff6b81'
          context.fill()
          
          // 绘制佩戴文本
          context.fillStyle = '#ffffff'
          context.font = 'bold 14px LXGW WenKai Lite'
          context.textAlign = 'center'
          context.textBaseline = 'middle'
          context.fillText('已佩戴', wearingX + wearingWidth / 2, wearingY + medalBoxHeight / 2)
          context.restore()
        }

        // 获取直播状态文本
        let liveStatusText = '';
        
        if (item.live_status === 1) {
          liveStatusText = '直播中';
        } else if (item.live_status === 2) {
          liveStatusText = '轮播中';
        } else {
          liveStatusText = '未直播';
        }
        
        // 绘制UP主名称和直播状态
        context.fillStyle = '#555555'
        context.font = '14px LXGW WenKai Lite'
        context.textAlign = 'left'
        context.fillText(`UP主：${item.target_name}  UID：${medal.target_id}  状态：${liveStatusText}`, padding + 20, startY + padding + 60);

        // 亲密度信息 - 修改为简洁的格式
        // 根据等级选择显示标签
        let intimacyLabel = '亲密度';
        if (medal.level >= 21 || medal.guard_level > 0) {
          intimacyLabel = '航海亲密度';
        }

        context.fillStyle = '#555555';
        context.font = '14px LXGW WenKai Lite';
        context.textAlign = 'left';
        context.fillText(
          `${intimacyLabel}: ${medal.intimacy}/${medal.next_intimacy}`,
          padding + 20, 
          startY + padding + 85
        )
        context.fillText(
          `今日上限 ${medal.today_feed}/${medal.day_limit}`,
          padding + 270,
          startY + padding + 85
        )

        // 亲密度进度条 - 类似于图片中的样式
        const progressWidth = width - (padding * 2) - 50; // 增加内边距，确保不会超出卡片
        const progressHeight = 5; // 细的进度条
        const progressPercent = Math.min(100, (medal.intimacy / medal.next_intimacy) * 100);
        const filledWidth = (progressWidth * progressPercent) / 100;

        // 进度条背景 - 使用固定颜色 #DBDDDF
        context.fillStyle = '#DBDDDF';
        context.fillRect(padding + 25, startY + padding + 95, progressWidth, progressHeight);

        // 进度条填充 - 使用固定颜色 #00A3DC
        context.fillStyle = '#00A3DC';
        context.fillRect(padding + 25, startY + padding + 95, filledWidth, progressHeight);
      }

      // 如果只有1个勋章，添加底部提示
      if (count === 1) {
        // 底部提示区域
        const footerY = titleHeight + (medals.length * medalHeight) + padding
        
        // 绘制提示背景
        context.fillStyle = '#f5f5f5' // 浅灰色背景
        context.fillRect(padding, footerY, width - (padding * 2), footerHeight - padding)
        
        // 绘制提示文本
        context.fillStyle = '#888888' // 灰色文字
        context.font = '14px LXGW WenKai Lite' // 移除粗体
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText('注意：该用户可能设置了仅展示佩戴中的粉丝勋章', width / 2, footerY + (footerHeight - padding) / 2)
      }

      // 保存图片到内存并返回base64数据
      const buffer = canv.toBuffer('image/png')
      
      // 转换为base64编码 - 使用新的data:前缀格式
      const base64Image = `data:image/png;base64,${buffer.toString('base64')}`
      
      log.debug(`图片渲染完成: 大小=${buffer.length}字节`)
      return base64Image
    } catch (error) {
      log.error(`图片渲染失败`, error)
      throw new Error(`图片渲染失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  // 获取用户粉丝勋章
  const getMedals = async (uid: string): Promise<APIResponse> => {
    log.debug(`开始获取用户 ${uid} 的粉丝勋章`)
    
    try {
      const url = 'https://api.live.bilibili.com/xlive/web-ucenter/user/MedalWall'
      log.debug(`API请求: ${url}?target_id=${uid}`)
      
      const response = await axios.get(url, {
        params: {
          target_id: uid
        },
        headers: {
          Cookie: `SESSDATA=${config.SESSDATA}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 10000 // 增加超时时间到10秒
      })
      
      log.debug(`API返回状态码: ${response.status}`)
      
      if (config.debugMode) {
        log.debug(`API返回数据: ${JSON.stringify(response.data, null, 2)}`)
      }
      
      return response.data
    } catch (error) {
      log.error(`获取粉丝勋章失败`, error)
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
      log.debug(`发送消息成功: ${session.channelId}, 用户: ${session.userId}`)
    } catch (error) {
      log.error(`发送消息失败`, error)
    }
  }

  // 注册getmedals命令
  ctx.command('getmedals <uid:string> [upUid:string]', '获取B站用户粉丝勋章信息')
    .option('image', '-i', { fallback: false })
    .action(async ({ session, options }, uid, upUid) => {
      // 检查options的值和格式
      log.debug(`命令选项原始值: ${JSON.stringify(options)}`)
      
      // 确保选项正确处理
      const imageOption = !!options.image
      
      log.info(`收到命令: getmedals ${uid || ''} ${upUid || ''} ${imageOption ? '(图片模式)' : '(文本模式)'} [处理后选项值: image=${imageOption}]`)
      
      if (!uid) {
        await sendMessage(session, [h.text('请提供正确的B站UID')])
        return
      }

      // 处理UID前缀
      const cleanUid = uid.replace(/^UID[：:]\s*/, '')
      
      // 验证UID格式是否为纯数字
      if (!/^\d+$/.test(cleanUid)) {
        log.warn(`用户提供了非法UID格式: ${uid}`)
        await sendMessage(session, [h.text('请提供正确的B站UID，UID应为纯数字')])
        return
      }
      
      // 如果提供了upUid，也需验证其格式
      if (upUid) {
        const cleanUpUid = upUid.replace(/^UID[：:]\s*/, '')
        if (!/^\d+$/.test(cleanUpUid)) {
          log.warn(`用户提供了非法UP主UID格式: ${upUid}`)
          await sendMessage(session, [h.text('请提供正确的UP主UID，UID应为纯数字')])
          return
        }
        upUid = cleanUpUid
      }

      // 检查禁止查询列表
      if (config.blacklistUIDs.includes(cleanUid)) {
        log.info(`拒绝查询禁止查询列表中的用户 ${cleanUid} 的粉丝勋章`)
        await sendMessage(session, [h.text(`该UID已被设为禁止查询，无法获取其粉丝勋章信息`)])
        return
      }

      try {
        const response = await getMedals(cleanUid)
        
        if (response.code !== 0) {
          log.warn(`API请求失败: 错误码 ${response.code}, 错误信息: ${response.message}`)
          await sendMessage(session, [h.text(`获取勋章失败: ${response.message || '未知错误'} (错误码: ${response.code})`)])
          return
        }
        
        if (!response.data) {
          log.warn(`API返回数据为空`)
          await sendMessage(session, [h.text('获取勋章失败: 返回数据为空')])
          return
        }
        
        let { list, count, name } = response.data
        log.info(`用户 ${name}(${cleanUid}) 的粉丝勋章数量: ${count}`)
        
        // 如果指定了UP主UID，则筛选对应UP主的勋章
        if (upUid) {
          log.debug(`筛选UP主 ${upUid} 的粉丝勋章`)
          const upUidNum = Number(upUid)
          const originalCount = list.length
          list = list.filter(item => item.medal_info.target_id === upUidNum)
          
          if (list.length === 0) {
            log.info(`用户 ${name}(${cleanUid}) 没有UP主 ${upUid} 的粉丝勋章`)
            await sendMessage(session, [h.text(`用户 ${name}(${cleanUid}) 没有UP主 ${upUid} 的粉丝勋章`)])
            return
          }
          
          count = list.length
          const upName = list[0].target_name
          log.info(`找到UP主 ${upName}(${upUid}) 的粉丝勋章`)

          // 获取用户头像URL
          const userIcon = response.data?.icon || '';

          // 根据参数决定使用图片渲染还是文本模式
          if (imageOption) {
            try {
              // 发送等待消息
              const loadingMsg = await session.send('正在获取用户粉丝勋章并渲染图片...请稍等~')
              
              // 渲染图片
              const imageData = await renderMedalsImage(list, name, cleanUid, count, upName, upUid, userIcon)
              
              // 发送图片并撤回加载消息
              await sendMessage(session, [h.image(imageData)])
              
              // 尝试撤回等待消息
              try {
                if (loadingMsg) {
                  log.debug(`尝试撤回临时消息，ID类型: ${typeof loadingMsg}, 数据: ${JSON.stringify(loadingMsg, null, 2)}`);
                  
                  // 根据不同平台适配消息ID提取
                  let messageId: string | undefined;
                  
                  if (typeof loadingMsg === 'string') {
                    messageId = loadingMsg;
                  } else if (typeof loadingMsg === 'object' && loadingMsg !== null) {
                    // 尝试各种可能的属性路径获取消息ID
                    if (Array.isArray(loadingMsg) && loadingMsg.length > 0) {
                      // 数组格式，尝试获取第一个元素
                      const firstElement = loadingMsg[0];
                      if (firstElement && typeof firstElement === 'object') {
                        messageId = (firstElement as any).messageId || (firstElement as any).id;
                      } else if (firstElement && typeof firstElement === 'string') {
                        messageId = firstElement;
                      }
                    } else {
                      // 尝试常见的消息ID属性
                      const msgObj = loadingMsg as Record<string, any>;
                      messageId = msgObj['messageId'] || 
                               msgObj['id'] || 
                               msgObj['message_id'] || 
                               (msgObj['data'] && msgObj['data']['messageId']) ||
                               (msgObj['data'] && msgObj['data']['id']) ||
                               (msgObj['data'] && msgObj['data']['message_id']);
                    }
                  }
                  
                  if (messageId) {
                    log.debug(`找到消息ID: ${messageId}，准备撤回`);
                    await session.bot.deleteMessage(session.channelId, messageId);
                    log.debug(`成功撤回临时消息`);
                  } else {
                    log.warn(`无法获取临时消息ID，撤回失败，消息对象: ${typeof loadingMsg === 'object' ? JSON.stringify(loadingMsg) : loadingMsg}`);
                  }
                }
              } catch (deleteError) {
                log.warn(`撤回等待消息失败: ${deleteError instanceof Error ? deleteError.message : '未知错误'}`, deleteError)
                // 失败不影响主流程
              }
            } catch (error) {
              log.error(`图片渲染失败，退回使用文本模式`, error)
              await sendMessage(session, [
                h.text(`由于图片渲染服务不可用，以文本模式为您展示：\n\n用户 ${name}(${cleanUid}) 的UP主 ${upName}(${upUid}) 粉丝勋章:\n\n`),
                h.text(formatMedalInfo(list, true))
              ])
            }
          } else {
            await sendMessage(session, [
              h.text(`用户 ${name}(${cleanUid}) 的UP主 ${upName}(${upUid}) 粉丝勋章:\n\n`),
              h.text(formatMedalInfo(list, true))
            ])
          }
          
          return
        }
        
        if (count === 0 || !list.length) {
          log.info(`用户 ${name}(${cleanUid}) 没有粉丝勋章或未公开显示`)
          await sendMessage(session, [h.text(`用户 ${name}(${cleanUid}) 没有粉丝勋章或未公开显示粉丝勋章`)])
          return
        }
        
        // 获取用户头像URL
        const userIcon = response.data?.icon || '';

        // 如果只有1个勋章，提示可能是仅展示佩戴中的勋章
        let additionalMsg = ''
        if (count === 1) {
          log.info(`用户 ${name}(${cleanUid}) 只有1个粉丝勋章，可能是仅展示佩戴中勋章`)
          additionalMsg = '注意：该用户可能设置了仅展示佩戴中的粉丝勋章\n\n'
        }
        
        // 根据参数决定使用图片渲染还是文本模式
        if (imageOption) {
          try {
            // 发送等待消息
            const loadingMsg = await session.send('正在获取用户粉丝勋章并渲染图片...请稍等~')
            
            // 渲染图片
            const imageData = await renderMedalsImage(list, name, cleanUid, count, undefined, undefined, userIcon)
            
            // 发送图片并撤回加载消息
            await sendMessage(session, [h.image(imageData)])
            
            // 尝试撤回等待消息
            try {
              if (loadingMsg) {
                log.debug(`尝试撤回临时消息，ID类型: ${typeof loadingMsg}, 数据: ${JSON.stringify(loadingMsg, null, 2)}`);
                
                // 根据不同平台适配消息ID提取
                let messageId: string | undefined;
                
                if (typeof loadingMsg === 'string') {
                  messageId = loadingMsg;
                } else if (typeof loadingMsg === 'object' && loadingMsg !== null) {
                  // 尝试各种可能的属性路径获取消息ID
                  if (Array.isArray(loadingMsg) && loadingMsg.length > 0) {
                    // 数组格式，尝试获取第一个元素
                    const firstElement = loadingMsg[0];
                    if (firstElement && typeof firstElement === 'object') {
                      messageId = (firstElement as any).messageId || (firstElement as any).id;
                    } else if (firstElement && typeof firstElement === 'string') {
                      messageId = firstElement;
                    }
                  } else {
                    // 尝试常见的消息ID属性
                    const msgObj = loadingMsg as Record<string, any>;
                    messageId = msgObj['messageId'] || 
                             msgObj['id'] || 
                             msgObj['message_id'] || 
                             (msgObj['data'] && msgObj['data']['messageId']) ||
                             (msgObj['data'] && msgObj['data']['id']) ||
                             (msgObj['data'] && msgObj['data']['message_id']);
                  }
                }
                
                if (messageId) {
                  log.debug(`找到消息ID: ${messageId}，准备撤回`);
                  await session.bot.deleteMessage(session.channelId, messageId);
                  log.debug(`成功撤回临时消息`);
                } else {
                  log.warn(`无法获取临时消息ID，撤回失败，消息对象: ${typeof loadingMsg === 'object' ? JSON.stringify(loadingMsg) : loadingMsg}`);
                }
              }
            } catch (deleteError) {
              log.warn(`撤回等待消息失败: ${deleteError instanceof Error ? deleteError.message : '未知错误'}`, deleteError)
              // 失败不影响主流程
            }
          } catch (error) {
            log.error(`图片渲染失败，退回使用文本模式`, error)
            await sendMessage(session, [
              h.text(`由于图片渲染服务不可用，以文本模式为您展示：\n\n用户 ${name}(${cleanUid}) 的粉丝勋章 (共${count}个):\n${additionalMsg}`),
              h.text(formatMedalInfo(list, false))
            ])
          }
        } else {
          await sendMessage(session, [
            h.text(`用户 ${name}(${cleanUid}) 的粉丝勋章 (共${count}个):\n${additionalMsg}`),
            h.text(formatMedalInfo(list, false))
          ])
        }
      } catch (error) {
        log.error(`处理请求失败`, error)
        let errorMessage = `获取勋章失败: ${error instanceof Error ? error.message : '未知错误'}`
        
        if (config.debugMode && error instanceof Error) {
          errorMessage += `\n调试信息: ${error.stack || '无堆栈信息'}`
        }
        
        await sendMessage(session, [h.text(errorMessage)])
      }
    })

  // 注册帮助信息
  ctx.command('getmedals.help', '获取粉丝勋章指令帮助信息')
    .action(async ({ session }) => {
      const helpText = `
📋 粉丝勋章查询指令使用说明：

1️⃣ 基本用法：
   getmedals <用户UID>
   例如：getmedals 123456789

2️⃣ 查询指定UP主的粉丝勋章：
   getmedals <用户UID> <UP主UID>
   例如：getmedals 123456789 987654321

3️⃣ 以图片形式显示（需安装canvas插件）：
   getmedals <用户UID> -i
   例如：getmedals 123456789 -i

4️⃣ 组合使用：
   getmedals <用户UID> <UP主UID> -i
   例如：getmedals 123456789 987654321 -i

❓ 查看帮助：
   getmedals.help
      `
      await sendMessage(session, [h.text(helpText)])
    })
}

/*
 * 关于图片渲染：
 * 
 * 本插件现使用 canvas 进行图片渲染，这是一个基于 Skia 的 Canvas 实现。
 * 相比 Puppeteer，它更轻量，不需要浏览器环境，性能更好。
 * 
 * 使用须知：
 * 1. 需要在Koishi市场安装 canvas 插件
 * 2. 默认使用 "LXGW WenKai Lite" 字体，确保在canvas设置中配置了该字体
 * 3. 如果需要更改字体，修改renderMedalsImage函数中的字体设置
 */
