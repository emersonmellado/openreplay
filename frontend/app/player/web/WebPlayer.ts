import { Log, LogLevel } from './types'

import type { Store } from 'App/player'
import Player from '../player/Player'

import MessageManager from './MessageManager'
import InspectorController from './addons/InspectorController'
import TargetMarker from './addons/TargetMarker'
import Screen from './Screen/Screen'

// export type State = typeof WebPlayer.INITIAL_STATE

export default class WebPlayer extends Player {
  static readonly INITIAL_STATE = {
    ...Player.INITIAL_STATE,
    ...TargetMarker.INITIAL_STATE,
    ...MessageManager.INITIAL_STATE,

    inspectorMode: false,
    portHeight: 0,
  }

  private readonly inspectorController: InspectorController
  protected readonly screen: Screen
  protected readonly messageManager: MessageManager

  private targetMarker: TargetMarker

  constructor(protected wpState: Store<typeof WebPlayer.INITIAL_STATE>, session: any, live: boolean) {
    let initialLists = live ? {} : {
      event: session.events || [],
      stack: session.stackEvents || [],
      resource: session.resources || [], // MBTODO: put ResourceTiming in file
      exceptions: session.errors?.map(({ name, ...rest }: any) =>
        Log({
          level: LogLevel.ERROR,
          value: name,
          ...rest,
        })
      ) || [],
    }

    const screen = new Screen(session.isMobile)
    const messageManager = new MessageManager(session, wpState, screen, initialLists)
    super(wpState, messageManager)
    this.screen = screen
    this.messageManager = messageManager

    this.targetMarker = new TargetMarker(this.screen, wpState)
    this.inspectorController = new InspectorController(screen)


    const endTime = session.duration?.valueOf() || 0
    wpState.update({
      //@ts-ignore
      session,

      live,
      livePlay: live,
      endTime, // : 0,
    })

  }

  attach = (parent: HTMLElement) => {
    this.screen.attach(parent)
    window.addEventListener('resize', this.scale)
    this.scale()
  }
  scale = () => {
    const { width, height } = this.wpState.get()
    this.screen.scale({ width, height })
    this.inspectorController.scale({ width, height })

    // this.updateMarketTargets() ??
  }

  scaleFullPage = () => {
    window.removeEventListener('resize', this.scaleFullPage)
    window.addEventListener('resize', this.scaleFullPage)

    const portHeight = this.screen.scaleFullPage()
    return this.wpState.update({ portHeight })
  }

  // Inspector & marker
  mark(e: Element) {
    this.inspectorController.marker?.mark(e)
  }

  toggleInspectorMode = (flag: boolean, clickCallback?: Parameters<InspectorController['enableInspector']>[0]) => {
    if (typeof flag !== 'boolean') {
      const { inspectorMode } = this.wpState.get()
      flag = !inspectorMode
    }

    if (flag) {
      this.pause()
      this.wpState.update({ inspectorMode: true })
      return this.inspectorController.enableInspector(clickCallback)
    } else {
      this.inspectorController.disableInspector()
      this.wpState.update({ inspectorMode: false })
    }
  }

  // Target Marker
  setActiveTarget = (...args: Parameters<TargetMarker['setActiveTarget']>) => {
    this.targetMarker.setActiveTarget(...args)
  }

  markTargets = (...args: Parameters<TargetMarker['markTargets']>) => {
    this.pause()
    this.targetMarker.markTargets(...args)
  }

  showClickmap = (...args: Parameters<TargetMarker['injectTargets']>) => {
    this.freeze()
    if (this.wpState.get().portHeight !== 0) {
      this.targetMarker.injectTargets(...args)
    } else {
      setTimeout(() => this.showClickmap(...args), 500)
    }
  }

  setMarkerClick = (...args: Parameters<TargetMarker['setOnMarkerClick']>) => {
    this.targetMarker.setOnMarkerClick(...args)
  }

  toggleUserName = (name?: string) => {
    this.screen.cursor.showTag(name)
  }

  clean = () => {
    super.clean()
    window.removeEventListener('resize', this.scale)
  }
}
