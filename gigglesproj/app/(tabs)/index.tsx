// app/(tabs)/index.tsx
import { useRef, useState, useEffect } from "react";
import {
  View,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  useWindowDimensions,
  Pressable,
} from "react-native";
import type { FlatList as RNFlatList } from "react-native";
import { Video, ResizeMode, type AVPlaybackSource } from "expo-av";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Asset } from "expo-asset";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

type Item = { id: string; source: AVPlaybackSource };

const DATA: Item[] = [
  { id: "1", source: require("../../assets/videos/vid1.mp4") },
  { id: "2", source: require("../../assets/videos/vid2.mp4") },
  { id: "3", source: require("../../assets/videos/vid3.mp4") },
  { id: "4", source: require("../../assets/videos/vid4.mp4") },
];

async function preload(source: AVPlaybackSource) {
  if (typeof source === "number") {
    await Asset.fromModule(source).downloadAsync();
  } else if ("uri" in source && source.uri) {
    await Asset.fromURI(source.uri).downloadAsync();
  }
}

export default function Feed() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  // Page height excludes the bottom tab bar.
  const pageHeight = height - tabBarHeight;

  // Video sits below the Dynamic Island and above the tab bar.
  const videoTop = insets.top;
  const videoHeight = pageHeight - insets.top;

  const players = useRef(new Map<string, Video | null>());
  const listRef = useRef<RNFlatList<Item>>(null);

  const [activeId, setActiveId] = useState<string>(DATA[0].id);
  const [paused, setPaused] = useState(false);

  // Autoplay the active item. Pause others.
  useEffect(() => {
    players.current.forEach(async (p, id) => {
      if (!p) return;
      try {
        if (id === activeId && !paused) await p.playAsync();
        else await p.pauseAsync();
      } catch {}
    });
  }, [activeId, paused]);

  // Preload and prebuffer neighbors to reduce swap latency.
  useEffect(() => {
    const i = DATA.findIndex((d) => d.id === activeId);
    const prev = DATA[i - 1]?.source;
    const next = DATA[i + 1]?.source;

    (async () => {
      try {
        if (prev) await preload(prev);
        if (next) await preload(next);
      } catch {}

      const neighborIds = [DATA[i - 1]?.id, DATA[i + 1]?.id].filter(Boolean) as string[];
      for (const id of neighborIds) {
        const v = players.current.get(id);
        try {
          await v?.setStatusAsync({ shouldPlay: false, positionMillis: 0 });
        } catch {}
      }
    })();
  }, [activeId]);

  // reset pause state whenever the active item changes
  useEffect(() => {
    setPaused(false);
  }, [activeId]);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.y / pageHeight);
    const next = DATA[index]?.id;
    if (next && next !== activeId) setActiveId(next);
  };

  const handleVideoError = async (id: string, source: AVPlaybackSource) => {
    const p = players.current.get(id);
    if (!p) return;
    try {
      // Try quick replay first
      await p.replayAsync();
    } catch {
      try {
        // Full reload if replay fails (e.g., AVFoundationErrorDomain -11819)
        await p.unloadAsync();
        await p.loadAsync(source, { shouldPlay: id === activeId && !paused }, true);
      } catch {}
    }
  };

  const renderItem = ({ item }: { item: Item }) => {
    const isActive = item.id === activeId;
    return (
      <View style={{ height: pageHeight, backgroundColor: "black", overflow: "hidden" }}>
        <Video
          ref={(r) => {
            players.current.set(item.id, r);
          }}
          source={item.source}
          style={{ position: "absolute", top: videoTop, width, height: videoHeight }}
          resizeMode={ResizeMode.COVER} // use CONTAIN if you prefer no crop
          isLooping
          shouldPlay={isActive && !paused}
          onError={() => handleVideoError(item.id, item.source)}
        />

        <Pressable
          onPress={() => {
            if (isActive) setPaused((v) => !v);
          }}
          style={{ flex: 1 }}
        >
          {isActive && paused ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: insets.top,
                bottom: 0,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 42,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="play" size={48} color="white" style={{ opacity: 0.6 }} />
              </View>
            </View>
          ) : null}
        </Pressable>
      </View>
    );
  };

  return (
    <FlatList
      ref={listRef}
      data={DATA}
      keyExtractor={(i) => i.id}
      renderItem={renderItem}
      pagingEnabled
      snapToInterval={pageHeight}
      decelerationRate="fast"         // allow a bit of glide like TikTok
      bounces={false}
      // disableIntervalMomentum={false} // let momentum settle before snapping
      scrollEventThrottle={16}
      snapToAlignment="start"
      showsVerticalScrollIndicator={false}
      onMomentumScrollEnd={onMomentumScrollEnd} // choose item after natural snap
      initialNumToRender={3}
      windowSize={5}
      maxToRenderPerBatch={5}
      removeClippedSubviews={false}
      getItemLayout={(_, i) => ({ length: pageHeight, offset: pageHeight * i, index: i })}
      contentInsetAdjustmentBehavior="never"
    />
  );
}