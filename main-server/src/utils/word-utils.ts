import * as fs from "fs";
import * as path from "path";

function loadWordList(): string[] {
  const filePath = path.join(__dirname, "wordlist.txt");

  const fileContent = fs.readFileSync(filePath, "utf-8");

  // 按行分割，并过滤掉空行
  return fileContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export const cloudSkipWords = loadWordList();