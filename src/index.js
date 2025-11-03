// ======================================================================
// X(API v2) × GAS：Driveの画像1枚だけを投稿するBOT
// ======================================================================

// エンドポイント
const X_TWEETS = "https://api.x.com/2/tweets";
const X_MEDIA_UPLOAD = "https://api.x.com/2/media/upload";

// ここに投稿したいDriveの画像ファイルID
// const DRIVE_FILE_ID = PropertiesService.getScriptProperties().getProperty("DRIVE_FILE_ID");

// 画像付きツイート投稿
function tweetImage() {
  main();
  const service = getService();

  // 1) Driveから画像Blob
  // const img = DriveApp.getFileById(DRIVE_FILE_ID).getBlob();

  const fileId = getRandomImage();

  const img = DriveApp.getFileById(fileId).getBlob();


  // 2) v2 アップロード
  const mediaId = uploadMediaV2(img, service);
  if (!mediaId) throw new Error("media upload failed");

  // 3) v2 投稿
  const res = UrlFetchApp.fetch(X_TWEETS, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + service.getAccessToken(),
      "Content-Type": "application/json",
    },
    payload: JSON.stringify({
      text: "",
      media: { media_ids: [mediaId] },
    }),
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code !== 200 && code !== 201) {
    throw new Error(`Tweet failed: ${code}\n${body}`);
  }
  Logger.log("OK: " + body);
}

// アップロード（multipart/form-data）
function uploadMediaV2(imageBlob, service) {
  const res = UrlFetchApp.fetch(X_MEDIA_UPLOAD, {
    method: "POST",
    headers: { Authorization: "Bearer " + service.getAccessToken() },
    payload: {
      media: imageBlob,
      media_category: "tweet_image",
      media_type: imageBlob.getContentType(),
    },
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code !== 200 && code !== 201) {
    throw new Error(`Upload failed: ${code}\n${body}`);
  }

  const json = JSON.parse(body);
  const mediaId = json.data.id;
  if (!mediaId) throw new Error(`No media id in response: ${body}`);
  console.log(`mediaId: ${mediaId}`);
  return mediaId;
}

// フォルダ内の画像ファイルからランダムに1つIDを取得
function getRandomImage() {
  const folderId = PropertiesService.getScriptProperties().getProperty("FOLDER_ID");
  if (!folderId) throw new Error("FOLDER_ID が未設定です");
  const folder = DriveApp.getFolderById(folderId);

  // フォルダ直下のみが対象。サブフォルダも含めたいなら別関数で回そう（下に例あり）
  const q = "mimeType contains \"image/\" and trashed = false";
  const it = folder.searchFiles(q);

  let chosenId = null;
  let seen = 0;

  while (it.hasNext()) {
    const file = it.next();
    seen++;
    if (Math.floor(Math.random() * seen) === 0) {
      chosenId = file.getId();
    }
  }

  if (!chosenId) throw new Error("このフォルダに画像が見つかりませんでした。");
  console.log(`Found image file ID: ${chosenId}`);
  return chosenId;
}


// OAuth2 設定
const CLIENT_ID = PropertiesService.getScriptProperties().getProperty("X_CLIENT_ID");
const CLIENT_SECRET = PropertiesService.getScriptProperties().getProperty("X_CLIENT_SECRET");

function getService() {
  pkceChallengeVerifier();
  const userProps = PropertiesService.getUserProperties();
  const scriptProps = PropertiesService.getScriptProperties();
  return OAuth2.createService("twitter")
    .setAuthorizationBaseUrl("https://twitter.com/i/oauth2/authorize")
    .setTokenUrl("https://api.twitter.com/2/oauth2/token?code_verifier=" + userProps.getProperty("code_verifier"))
    .setClientId(CLIENT_ID)
    .setClientSecret(CLIENT_SECRET)
    .setCallbackFunction("authCallback")
    .setPropertyStore(userProps)
    .setScope("users.read tweet.read tweet.write media.write offline.access")
    .setParam("response_type", "code")
    .setParam("code_challenge_method", "S256")
    .setParam("code_challenge", userProps.getProperty("code_challenge"))
    .setTokenHeaders({
      "Authorization": "Basic " + Utilities.base64Encode(CLIENT_ID + ":" + CLIENT_SECRET),
      "Content-Type": "application/x-www-form-urlencoded",
    });
}

function authCallback(request) {
  const service = getService();
  const authorized = service.handleCallback(request);
  if (authorized) {
    return HtmlService.createHtmlOutput("Success!");
  }
  else {
    return HtmlService.createHtmlOutput("Denied.");
  }
}

function pkceChallengeVerifier() {
  const userProps = PropertiesService.getUserProperties();
  if (!userProps.getProperty("code_verifier")) {
    let verifier = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

    for (let i = 0; i < 128; i++) {
      verifier += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    const sha256Hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, verifier);

    const challenge = Utilities.base64Encode(sha256Hash)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    userProps.setProperty("code_verifier", verifier);
    userProps.setProperty("code_challenge", challenge);
  }
}

function logRedirectUri() {
  const service = getService();
  Logger.log(service.getRedirectUri());
}

function main() {
  const service = getService();
  if (service.hasAccess()) {
    Logger.log("Already authorized");
  }
  else {
    const authorizationUrl = service.getAuthorizationUrl();
    Logger.log("Open the following URL and re-run the script: %s", authorizationUrl);
  }
}

// 認証情報リセット
function resetAuthAll() {
  const service = getService();
  service.reset();

  const up = PropertiesService.getUserProperties();
  up.deleteProperty("code_verifier");
  up.deleteProperty("code_challenge");
  Logger.log("Reset done.");
}
