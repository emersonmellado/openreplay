import type { Message } from './message.gen';
import type { RawMessage } from './raw.gen';
import { MType } from './raw.gen';
import RawMessageReader from './RawMessageReader.gen';
import rewriteMessage from './rewriter/rewriteMessage'
import Logger from 'App/logger'

// TODO: composition instead of inheritance
// needSkipMessage() and next() methods here use buf and p protected properties,
// which should be probably somehow incapsulated
export default class MFileReader extends RawMessageReader {
  private pLastMessageID: number = 0
  private currentTime: number
  public error: boolean = false
  private noIndexes: boolean = false
  constructor(data: Uint8Array, private startTime?: number, private logger= console) {
    super(data)
    // if (noIndexes) this.noIndexes = true
  }

  public checkForIndexes() {
    // 0xff 0xff 0xff 0xff 0xff 0xff 0xff 0xff = no indexes + weird failover (don't ask)
    const skipIndexes = this.readCustomIndex(this.buf.slice(0, 8)) === 72057594037927940
      || this.readCustomIndex(this.buf.slice(0, 9)) === 72057594037927940

    if (skipIndexes) {
      this.noIndexes = true
      this.skip(8)
      return true
    }
    return false
  }

  private needSkipMessage(): boolean {
    if (this.p === 0) return false
    for (let i = 7; i >= 0; i--) {
      if (this.buf[ this.p + i ] !== this.buf[ this.pLastMessageID + i ]) {
        return this.buf[ this.p + i ] < this.buf[ this.pLastMessageID + i ]
      }
    }
    return false
  }

  private getLastMessageID(): number {
    let id = 0
    for (let i = 0; i< 8; i++) {
      id += this.buf[ this.p + i ] * 2**(8*i)
    }
    return id
  }

  private readRawMessage(): RawMessage | null {
    if (!this.noIndexes) this.skip(8)
    try {
      const msg = super.readMessage()
      if (!msg) {
        this.skip(-8)
      }
      return msg
    } catch (e) {
      this.error = true
      this.logger.error("Read message error:", e)
      return null
    }
  }

  currentTab = 'back-compatability'
  readNext(): Message & { _index?: number } | null {
    if (this.error || !this.hasNextByte()) {
      return null
    }

    while (!this.noIndexes && this.needSkipMessage()) {
      const skippedMessage = this.readRawMessage()
      if (!skippedMessage) {
        return null
      }
      Logger.group("Openreplay: Skipping messages ", skippedMessage)
    }
    this.pLastMessageID = this.noIndexes ? 0 : this.p

    const rMsg = this.readRawMessage()
    if (!rMsg) {
      return null
    }

    if (rMsg.tp === MType.TabData) {
      this.currentTab = rMsg.tabId
      return this.readNext()
    }
    if (rMsg.tp === MType.Timestamp) {
      if (!this.startTime) {
        this.startTime = rMsg.timestamp
      }
      this.currentTime = rMsg.timestamp - this.startTime
      return {
        tp: 9999,
        time: this.currentTime,
      }
    }

    const index = this.noIndexes ? 0 : this.getLastMessageID()
    const msg = Object.assign(rewriteMessage(rMsg), {
      time: this.currentTime || rMsg.timestamp - this.startTime!,
      tabId: this.currentTab,
    }, !this.noIndexes ? { _index: index } : {})

    return msg
  }
}
