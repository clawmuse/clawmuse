import { useCallback, useMemo, useState } from "react";
import { Image, PanResponder, Text, View, type LayoutChangeEvent } from "react-native";
import type { DevicePlatform } from "../shared/contracts.js";
import type { PreviewSession, SessionSnapshot } from "./session.js";
import type { PreviewStyles } from "./styles.js";

interface ViewerProps {
  platform: DevicePlatform;
  snapshot: SessionSnapshot;
  session: PreviewSession;
  styles: PreviewStyles;
}
export function PreviewViewer({ platform, snapshot, session, styles }: ViewerProps) {
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const image = snapshot.image;
  const ratio = image ? image.width / image.height : 1;
  const width = Math.min(bounds.width, bounds.height * ratio);
  const height = width / ratio;
  const imageStyle = useMemo(() => ({ width, height }), [width, height]);
  const source = useMemo(() => ({ uri: `data:image/jpeg;base64,${image?.base64 ?? ""}` }), [image]);
  const measure = useCallback((event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout;
    setBounds({ width: measured.width, height: measured.height });
  }, []);
  const gestures = useMemo(() => {
    let origin = { x: 0, y: 0, time: 0 };
    let cancelled = false;
    function point(x: number, y: number) {
      return { x: Math.max(0, Math.min(1, x / width)), y: Math.max(0, Math.min(1, y / height)) };
    }
    return PanResponder.create({
      onStartShouldSetPanResponder: () =>
        platform === "android" && snapshot.phase === "ready" && !snapshot.inputPending,
      onPanResponderGrant: (event) => {
        cancelled = event.nativeEvent.touches.length !== 1;
        origin = {
          x: event.nativeEvent.locationX,
          y: event.nativeEvent.locationY,
          time: Date.now(),
        };
      },
      onPanResponderMove: (event) => {
        if (event.nativeEvent.touches.length !== 1) cancelled = true;
      },
      onPanResponderTerminate: () => {
        cancelled = true;
      },
      onPanResponderRelease: (_event, gesture) => {
        if (cancelled || !width || !height) return;
        const from = point(origin.x, origin.y);
        const to = point(origin.x + gesture.dx, origin.y + gesture.dy);
        if (Math.hypot(gesture.dx, gesture.dy) < 8)
          void session.input({ type: "tap", point: from });
        else
          void session.input({
            type: "swipe",
            from,
            to,
            durationMs: Math.max(100, Math.min(1500, Date.now() - origin.time)),
          });
      },
    });
  }, [platform, snapshot.phase, snapshot.inputPending, width, height, session]);
  const busy = snapshot.phase === "preparing" || snapshot.phase === "ready";
  return (
    <View onLayout={measure} style={styles.viewer}>
      {image && width > 0 ? (
        <View {...gestures.panHandlers} style={imageStyle}>
          <Image
            accessibilityLabel="模拟器截图"
            source={source}
            resizeMode="contain"
            style={imageStyle}
          />
        </View>
      ) : (
        <Text style={styles.detail}>{busy ? "等待第一张截图…" : "尚未连接设备"}</Text>
      )}
    </View>
  );
}
