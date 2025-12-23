export const dynamic = 'force-dynamic';
export const runtime = 'edge';

// 在 Cloudflare Pages 中，D1 和 KV 通过 process.env 访问
// 但实际绑定是在 request.env 中，需要从 context 获取
export async function POST(request, context) {
  try {
    const body = await request.json();
    const { xHandle, tweetLink, walletAddress, token } = body;

    // 验证必填字段
    if (!xHandle || !tweetLink || !walletAddress || !token) {
      return Response.json({
        error: 'Missing required fields',
        message: 'null'
      }, { status: 400 });
    }

    // 验证 token 格式
    const tokenParts = token.split('-');
    if (tokenParts.length < 4) {
      return Response.json({
        error: 'Invalid token format',
        message: 'INVALID TOKEN FORMAT'
      }, { status: 400 });
    }

    // 验证 token 是否过期（3秒有效期）
    const timestamp = parseInt(tokenParts[0]);
    const currentTime = Date.now();
    const expiresAt = timestamp + 3000; // 3秒

    if (currentTime > expiresAt) {
      return Response.json({
        error: 'Token expired',
        message: 'TOKEN HAS EXPIRED, PLEASE RE-VALIDATE'
      }, { status: 400 });
    }

    // 验证 token 是否太旧（必须在验证后短时间内提交）
    const tokenAge = currentTime - timestamp;
    if (tokenAge > 3000) { // 3秒
      return Response.json({
        error: 'Token too old',
        message: 'TOKEN IS TOO OLD, PLEASE RE-VALIDATE'
      }, { status: 400 });
    }

    // 验证 token 中的钱包地址是否匹配
    const addressHash = tokenParts[2];
    const expectedHash = walletAddress.substring(0, 8) + walletAddress.substring(walletAddress.length - 8);

    if (addressHash !== expectedHash) {
      return Response.json({
        error: 'Token wallet mismatch',
        message: 'TOKEN WALLET ADDRESS MISMATCH'
      }, { status: 400 });
    }

    // 验证 token 签名
    const secret = process.env.TOKEN_SECRET || 'alpha-project-secret-key';
    const uniqueToken = `${tokenParts[0]}-${tokenParts[1]}-${tokenParts[2]}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(uniqueToken + secret);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signatureHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const expectedSignature = signatureHex.substring(0, 16);

    if (tokenParts[3] !== expectedSignature) {
      return Response.json({
        error: 'Invalid token signature',
        message: 'INVALID TOKEN SIGNATURE'
      }, { status: 400 });
    }

    // 存储提交的数据到 Cloudflare D1 数据库
    // 注意：需要在 Cloudflare Dashboard 中创建 D1 数据库并绑定
    // 在 Cloudflare Pages 中，绑定通过 context.env 访问
    const db = context?.env?.DB || process.env.DB; // D1 数据库实例

    if (db) {
      try {
        // 检查是否已存在该钱包地址（防止重复提交）
        const existing = await db.prepare(
          'SELECT id FROM submissions WHERE wallet_address = ?'
        ).bind(walletAddress.trim()).first();

        if (existing) {
          return Response.json({
            error: 'Address already submitted',
            message: 'THIS WALLET ADDRESS HAS ALREADY BEEN SUBMITTED'
          }, { status: 400 });
        }

        // 插入新记录
        await db.prepare(
          `INSERT INTO submissions (wallet_address, x_handle, tweet_link, submitted_at) 
           VALUES (?, ?, ?, ?)`
        ).bind(
          walletAddress.trim(),
          xHandle.trim(),
          tweetLink.trim(),
          new Date().toISOString()
        ).run();

        console.log('数据已存储到 D1:', {
          walletAddress: walletAddress.trim(),
          xHandle: xHandle.trim(),
          tweetLink: tweetLink.trim()
        });
      } catch (dbError) {
        console.error('D1 数据库错误:', dbError);
        // 如果数据库操作失败，仍然返回成功（可选：根据需求决定是否严格）
      }
    } else {
      // 如果没有配置 D1，使用 KV 存储（备选方案）
      const kv = context?.env?.SUBMISSIONS_KV || process.env.SUBMISSIONS_KV; // KV 命名空间

      if (kv) {
        try {
          // 检查是否已存在
          const existing = await kv.get(walletAddress.trim());
          if (existing) {
            return Response.json({
              error: 'Address already submitted',
              message: 'THIS WALLET ADDRESS HAS ALREADY BEEN SUBMITTED'
            }, { status: 400 });
          }

          // 存储到 KV（使用钱包地址作为 key）
          const submissionData = JSON.stringify({
            walletAddress: walletAddress.trim(),
            xHandle: xHandle.trim(),
            tweetLink: tweetLink.trim(),
            submittedAt: new Date().toISOString()
          });

          await kv.put(walletAddress.trim(), submissionData);
          console.log('数据已存储到 KV:', walletAddress.trim());
        } catch (kvError) {
          console.error('KV 存储错误:', kvError);
        }
      } else {
        console.warn('警告: 未配置 D1 或 KV 存储，数据未持久化');
      }
    }

    console.log('提交成功:', {
      xHandle: xHandle.trim(),
      tweetLink: tweetLink.trim(),
      walletAddress: walletAddress.trim(),
      token
    });

    return Response.json({
      success: true,
      message: 'SUBMIT SUCCESS'
    }, { status: 200 });

  } catch (error) {
    console.error('Submit error:', error);
    return Response.json({
      error: 'Internal server error',
      message: 'SUBMIT FAILED, PLEASE TRY AGAIN LATER'
    }, { status: 500 });
  }
}
