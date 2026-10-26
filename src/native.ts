import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useEffect } from 'react';

/**
 * The phone features the iOS and Android apps add on top of the web game. Every call
 * also works in a browser (vibration, wake lock, share sheet) or quietly does nothing.
 */

/** True inside the iOS or Android app. */
export const NATIVE = Capacitor.isNativePlatform();

/** Where the web game lives. Join links and QR codes point here, so phones without the app can play. */
export const WEB_URL = 'https://turncloak.app/';

const quietly = (p: Promise<unknown>) => p.catch(() => undefined);

export type Buzz = 'tap' | 'thud' | 'turn' | 'win' | 'lose';

/** A short vibration for a game moment. */
export function buzz(kind: Buzz) {
  if (kind === 'tap') return quietly(Haptics.impact({ style: ImpactStyle.Light }));
  if (kind === 'thud') return quietly(Haptics.impact({ style: ImpactStyle.Heavy }));
  if (kind === 'turn') return quietly(Haptics.notification({ type: NotificationType.Warning }));
  if (kind === 'win') return quietly(Haptics.notification({ type: NotificationType.Success }));
  return quietly(Haptics.notification({ type: NotificationType.Error }));
}

/** Keeps the screen on while a game screen is open, so phones and the TV don't sleep mid-round. */
export function useKeepAwake() {
  useEffect(() => {
    quietly(KeepAwake.keepAwake());
    return () => void quietly(KeepAwake.allowSleep());
  }, []);
}

/** Opens the share sheet with an invite. False when there is no share sheet (most desktop browsers). */
export async function shareInvite(code: string, url: string): Promise<boolean> {
  try {
    if (!(await Share.canShare()).value) return false;
    await Share.share({ title: 'Join my Turncloak game', text: `Join my Turncloak game with code ${code}`, url });
    return true;
  } catch {
    return false;
  }
}

/** One-time app setup: dark status bar, hide the splash, and Android's back button walks back through screens. */
export function startNative() {
  if (!NATIVE) return;
  quietly(StatusBar.setStyle({ style: Style.Dark }));
  quietly(SplashScreen.hide());
  quietly(
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else quietly(App.exitApp());
    }),
  );
}
