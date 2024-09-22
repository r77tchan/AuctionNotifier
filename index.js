// ID設定、監視、スレッド関連、スレッド内関連
// testサーバー
// const monitoringChannel = '';
// const sendLogChannel = '';
// const beginnerTag = '';
// const react = '';
// const editDeleteNoticeTag = '';

// 本番環境
const monitoringChannel = '';
const sendLogChannel = '';
const beginnerTag = '';
const react = '';
const editDeleteNoticeTag = '';

let forumChannel;

// 初期化と権限設定
const { Client, GatewayIntentBits, channelLink } = require('discord.js');
const { log } = require('forever');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 起動時
client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    // フォーラムチャンネルを取得
    forumChannel = await client.channels.fetch(monitoringChannel);
    if (!forumChannel) {
      console.error("指定されたフォーラムチャンネルが見つかりませんでした。");
      return;
    }
    // フォーラムのスレッドを取得
    const fetchedThreads = await forumChannel.threads.fetch();
    console.log(`スレッド数: ${fetchedThreads.threads.size}`);
    fetchedThreads.threads.forEach(async (thread) => {
      try {
        // 各スレッド内のメッセージをフェッチ
        const messages = await thread.messages.fetch({ limit: 100 });
        console.log(`スレッド「${thread.name}」のメッセージ数: ${messages.size}`);
      } catch (error) {
        console.error(`スレッド「${thread.name}」のメッセージのフェッチに失敗しました:`, error.message || error);
      }
    });
  } catch (error) {
    console.error('フォーラムチャンネルの処理中にエラーが発生しました:', error.message || error);
  }
});

// 1分ごとにフォーラムのスレッドをチェックして再フェッチ（クローズ解除対策）
// 機能してないかつ、自動クローズロックがあるので没
// setInterval(async () => {
//   console.log("再フェッチ結果");
//   try {
//     const fetchedThreads = await forumChannel.threads.fetch();
//     fetchedThreads.threads.forEach(async (thread) => {
//       console.log(`アクティブなスレッド: ${thread.name}`);
//     });
//   } catch (error) {
//     console.error('スレッドのフェッチに失敗しました:', error.message || error);
//   }
// }, 60000);

// スレッド編集検知
client.on('threadUpdate', async (oldThread, newThread) => {
  if (newThread.parentId !== monitoringChannel) return;
  // タイトルの変更検知
  if (oldThread.name !== newThread.name) {
    try {
      // ログチャンネルを取得してメッセージを送信
      const logChannel = await client.channels.fetch(sendLogChannel);
      // リンクを作成
      const threadLink = `https://discord.com/channels/${newThread.guild.id}/${newThread.id}`;
      // サーバーからユーザー情報を取得
      const guildMember = await newThread.guild.members.fetch(newThread.ownerId);
      const displayName = guildMember.displayName;
      const authorTag = guildMember.user.tag;
      const authorLink = `https://discordapp.com/users/${newThread.ownerId}`;
      await logChannel.send(
        `# \`📝タイトル変更📝\`
        > スレ名 : [${newThread.name}](<${threadLink}>)
        > 作成者 : [${displayName}@${authorTag}](<${authorLink}>)
        > 作成時 : ${formatDate(newThread.createdAt)}
        > 変更時 : ${formatDate(new Date())}
        > 変更前 : ${oldThread.name}`
      );
    } catch (error) {
      console.error('スレッドの名前変更の検出中にエラーが発生:', error);
    }
  }
  // クローズで自動ロック、ロックで自動クローズ
  try {
    // スレッドがクローズ（アーカイブ）されたか確認
    if (!oldThread.archived && newThread.archived) {
      console.log(`スレッド「${newThread.name}」がクローズされました。`);

      // スレッドがクローズされているかつロックされていない場合、アーカイブ解除しつつロック（1回のAPIコール）
      if (!newThread.locked) {
        await newThread.edit({ archived: false, locked: true });
        console.log(`スレッド「${newThread.name}」のアーカイブを解除し、ロックしました。⭐️`);
      }
    }

    // スレッドがロックされたか確認
    if (!oldThread.locked && newThread.locked) {
      console.log(`スレッド「${newThread.name}」がロックされました。`);

      // スレッドがロックされているかつクローズされていない場合のみ、クローズ（1回のAPIコール）
      if (!newThread.archived) {
        await newThread.edit({ archived: true, locked: true });
        console.log(`スレッド「${newThread.name}」が自動でクローズされました。⭐️`);
      }
    }
  } catch (error) {
    console.error('ロック、クローズ処理中にエラーが発生:', error);
  }
});

// スレッド削除検知
client.on('threadDelete', async (thread) => {
  if(thread.parentId !== monitoringChannel) return;
  const logChannel = await client.channels.fetch(sendLogChannel);
  try {
    // サーバーからユーザー情報を取得
    const guildMember = await thread.guild.members.fetch(thread.ownerId);
    const displayName = guildMember.displayName;
    const authorTag = guildMember.user.tag;
    const authorLink = `https://discordapp.com/users/${thread.ownerId}`;
    await logChannel.send(
      `# \`❌スレ削除❌\`
      > スレ名 : ${thread.name}
      > 作成者 : [${displayName}@${authorTag}](<${authorLink}>)
      > 作成時 : ${formatDate(thread.createdAt)}
      > 削除時 : ${formatDate(new Date())}`
    );
    // guild.members.fetchがエラーを返す返す場合（スレッドの作成者がサーバーから追放されていたり、情報がキャッシュされていない場合）
  } catch (error) {
    await logChannel.send(
      `# \`❌スレ削除❌\`
      > スレ名 : ${thread.name}
      > 作成者 : スレッド作成者を取得できません
      > 作成時 : ${formatDate(thread.createdAt)}
      > 削除時 : ${formatDate(new Date())}`
    );
  }
});

// メッセージ編集の検知
client.on('messageUpdate', async (oldMessage, newMessage) => {
  // BOTによるメッセージの編集を無視
  if (!newMessage.author || newMessage.author.bot) return;
  // BOTへのDMの場合も無視
  if (!newMessage.guild) return;
  // 監視チャンネルの場合
  if (oldMessage.channel.parentId === monitoringChannel) {
    // 情報定義
    const logChannel = await client.channels.fetch(sendLogChannel);
    const threadName = oldMessage.channel.name;
    const messageLink = `https://discord.com/channels/${oldMessage.guild.id}/${oldMessage.channel.id}/${oldMessage.id}`;
    const displayName = oldMessage.member ? oldMessage.member.displayName : oldMessage.author.tag;
    const authorTag = oldMessage.author.tag;
    const authorLink = `https://discordapp.com/users/${oldMessage.author.id}`;
    const oldDate = formatDate(oldMessage.createdAt);
    const newDate = formatDate(newMessage.editedAt);
    const oldContent = oldMessage.content;
    const newContent = newMessage.content;
    let sentMessage;
    // スレッド本文の場合と返信の場合で処理を分ける（idがチャンネルと同じかどうかで判別）
    if (oldMessage.id === oldMessage.channel.id) {
      await logChannel.send(
        `# \`🖌️本文編集🖌️\`
        > スレ名 : [${threadName}](<${messageLink}>)
        > 投稿者 : [${displayName}@${authorTag}](<${authorLink}>)
        > 投稿時 : ${oldDate}
        > 編集時 : ${newDate}
        > 編集前 : \n` +
        `${oldContent}
        > 編集後 : \n` +
        `${newContent}`
      );
    } else {
      sentMessage = await logChannel.send(
        `# \`🖌️返信編集🖌️\`
        > スレ名 : [${threadName}](<${messageLink}>)
        > 返信者 : [${displayName}@${authorTag}](<${authorLink}>)
        > 返信時 : ${oldDate}
        > 編集時 : ${newDate}
        > 編集前 : \n` +
        `${oldContent}
        > 編集後 : \n` +
        `${newContent}`
      );
    }
    // 編集削除通知タグがついてる場合に通知する、スレ主のは除外
    if (newMessage.channel.appliedTags.includes(editDeleteNoticeTag) && newMessage.channel.ownerId != newMessage.author.id) {
      try {
        const logMessageLink = `https://discord.com/channels/${newMessage.guild.id}/${logChannel.id}/${sentMessage.id}`;
        await newMessage.reply(`<@${newMessage.channel.ownerId}> 編集を検知 ${logMessageLink}`);
      } catch (error) {
        console.error('messageUpdate内でのエラー発生', error);
      }
    }
  } else {
    // 監視チャンネルじゃない場合に盗聴する
    const logChannel = await client.channels.fetch('');
    const oldContent = oldMessage.content;
    const newContent = newMessage.content;
    await logChannel.send(
      `# \`✨✨✨編集情報✨✨✨\`
      > 編集前 : \n` +
      `${oldContent}
      > 編集後 ': \n` +
      `${newContent}`
    );
  }
});

// メッセージ削除の検知
client.on('messageDelete', async (message) => {
  // 監視チャンネルじゃないなら終了
  if (message.channel.parentId !== monitoringChannel) return;
  // 情報定義
  const logChannel = await client.channels.fetch(sendLogChannel);
  const threadName = message.channel.name;
  const threadLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}`;
  const displayName = message.member ? message.member.displayName : message.author.tag;
  const authorTag = message.author.tag;
  const authorLink = `https://discordapp.com/users/${message.author.id}`;
  const oldDate = formatDate(message.createdAt);
  const newDate = formatDate(new Date());
  const content = message.content;
  let sentMessage;
  // スレッド本文なら（メッセージidがチャンネルidと同じなら）本文削除、違うなら返信削除
  if (message.id === message.channel.id) {
    await logChannel.send(
      `# \`❌本文削除❌\`
      > スレ名 : ${threadName}
      > 投稿者 : [${displayName}@${authorTag}](<${authorLink}>)
      > 投稿時 : ${oldDate}
      > 削除時 : ${newDate}
      > 削除前 : \n` +
      `${content}`
    );
    // 自動スレ削除
    try {
      await message.channel.delete();
    } catch (error) {
      console.error('スレッド削除中にエラー発生', error);
    }
    // スレ削除後は下の削除通知の処理は必要ないのでreturn
    return;
  } else {
    sentMessage = await logChannel.send(
      `# \`❌返信削除❌\`
      > スレ名 : [${threadName}](<${threadLink}>)
      > 返信者 : [${displayName}@${authorTag}](<${authorLink}>)
      > 返信時 : ${oldDate}
      > 削除時 : ${newDate}
      > 削除前 : \n` +
      `${content}`
    );
  }
  // 編集削除通知タグがついてる場合に通知する、スレ主のは除外
  if (message.channel.appliedTags.includes(editDeleteNoticeTag) && message.channel.ownerId != message.author.id) {
    try {
      const logMessageLink = `https://discord.com/channels/${message.guild.id}/${logChannel.id}/${sentMessage.id}`;
      await message.channel.send(`<@${message.channel.ownerId}> 削除を検知 ${logMessageLink}`);
    } catch (error) {
      console.error('messageDelete内でのエラー発生', error);
    }
  }
});

client.on('messageCreate', async (message) => {
  // BOTによる投稿
  if (message.author.bot) return;
  // BOTへのDMの場合
  if (!message.guild) return;
  // 監視チャンネル（オークション）の場合
  if (message.channel.parentId === monitoringChannel) {
    // 指定のタグ（新規アカウント通知）がついている場合、かつスレ作成者によるものは除外する（スレ作成者が30日未満でも反応しない）
    if (message.channel.appliedTags.includes(beginnerTag) && message.channel.ownerId !== message.author.id) {
      // 日付取得、アカウント作成日時取得、日数の計算 (ミリ秒から日数に変換)
      const now = new Date();
      const accountCreationDate = message.author.createdAt;
      const daysSinceCreation = (now - accountCreationDate) / (1000 * 60 * 60 * 24);
      // アカウント作成が30日未満の場合
      if (daysSinceCreation < 30) {
        await message.reply('ルールに基づき、入札は無効となります');
        try {
          await message.react(react);
        } catch (error) {
          console.error('リアクションの追加中にエラーが発生しました:', error);
        }
      }
    }
    // 必ず行う処理、内容を通知する
    const logChannel = await client.channels.fetch(sendLogChannel);
    const threadName = message.channel.name;
    let threadLink;
    if (message.id === message.channel.id) {
      threadLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}`;
    } else {
      threadLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
    }
    const displayName = message.member ? message.member.displayName : message.author.tag;
    const authorTag = message.author.tag;
    const authorLink = `https://discordapp.com/users/${message.author.id}`;
    const date = formatDate(message.createdAt);
    const content = message.content;
    // スレ作成or新規返信、判別
    if (message.id === message.channel.id) {
      await logChannel.send(
        `# \`📒新規スレ📒\`
        > スレ名 : [${threadName}](<${threadLink}>)
        > 投稿者 : [${displayName}@${authorTag}](<${authorLink}>)
        > 投稿時 : ${date}
        > 本文 : \n` +
        `${content}`
      );
    } else {
      await logChannel.send(
        `# \`💬新規返信💬\`
        > スレ名 : [${threadName}](<${threadLink}>)
        > 返信者 : [${displayName}@${authorTag}](<${authorLink}>)
        > 返信時 : ${date}
        > 内容 : \n` +
        `${content}`
      );
    }
  } else {
    // 監視チャンネル（オークション）じゃない場合に盗聴する
    // でもトレ板の内容は要らない
    if (message.channel.id === '') return;
    const logChannel = await client.channels.fetch('');
    const channelName = message.channel.name;
    const channelLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}`;
    const displayName = message.member ? message.member.displayName : message.author.tag;
    const authorTag = message.author.tag;
    const authorLink = `https://discordapp.com/users/${message.author.id}`;
    const date = formatDate(message.createdAt);
    const content = message.content;
    await logChannel.send(
      `# \`🥷盗聴取得🥷\`
      > 場所名 : [${channelName}](<${channelLink}>)
      > 送信者 : [${displayName}@${authorTag}](<${authorLink}>)
      > 送信時 : ${date}
      > 内容 : \n` +
      `${content}`
    );
  }
});

// トークン
// AuctionNotifier(本番用)
client.login('');
// TestAuction(テスト用)
// client.login('');
// 招待URL(AuctionNotifier)
/*
https://discord.com/oauth2/authorize?client_id=xxxxxxxxxx&permissions=17179945984&integration_type=0&scope=bot
*/

// 以下使用関数
function formatDate(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 月は0から始まるので+1
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();

  // 数字が1桁の場合、先頭に0を追加
  const paddedMonth = String(month).padStart(2, '0');
  const paddedDay = String(day).padStart(2, '0');
  const paddedHours = String(hours).padStart(2, '0');
  const paddedMinutes = String(minutes).padStart(2, '0');
  const paddedSeconds = String(seconds).padStart(2, '0');

  return `${year}年${paddedMonth}月${paddedDay}日 ${paddedHours}時${paddedMinutes}分${paddedSeconds}秒`;
}
