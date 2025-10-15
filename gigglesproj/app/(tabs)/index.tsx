// app/(tabs)/index.tsx
// app/(tabs)/index.tsx
import React, { useRef, useState, useEffect } from "react";
import {
  View,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  useWindowDimensions,
  Pressable,
  Text,
  Animated,
} from "react-native";
import type { FlatList as RNFlatList } from "react-native";
import { Video, ResizeMode, type AVPlaybackSource } from "expo-av";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Asset } from "expo-asset";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import {
  Feather,
  Ionicons,
  MaterialCommunityIcons,
  AntDesign,
} from "@expo/vector-icons";
import { FontAwesome } from "@expo/vector-icons";
type Item = {
  id: string;
  source: AVPlaybackSource;
  user: string;
  caption: string;
  likes: string;
  comments: string;
};

const DATA: Item[] = [
  {
    id: "1",
    source: require("../../assets/videos/vid1.mp4"),
    user: "justin",
    caption: "everyone knows someone #relatable",
    likes: "16.4K",
    comments: "763",
  },
  {
    id: "2",
    source: require("../../assets/videos/vid2.mp4"),
    user: "alex",
    caption: "day in the city",
    likes: "2.1K",
    comments: "88",
  },
  {
    id: "3",
    source: require("../../assets/videos/vid3.mp4"),
    user: "maria",
    caption: "weekend vibes",
    likes: "9.8K",
    comments: "320",
  },
  {
    id: "4",
    source: require("../../assets/videos/vid4.mp4"),
    user: "sam",
    caption: "new recipe drop",
    likes: "4.3K",
    comments: "140",
  },
];

async function preload(source: AVPlaybackSource) {
  if (typeof source === "number")
    await Asset.fromModule(source).downloadAsync();
  else if ("uri" in source && source.uri)
    await Asset.fromURI(source.uri).downloadAsync();
}

export default function Feed() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const likeAnims = useRef(new Map<string, Animated.Value>()).current;
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({
    "1": 120,
    "2": 45,
    "3": 98,
    "4": 60,
  });

  const formatCount = (n: number) =>
    n < 1000 ? String(n) : `${(n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0)}K`;

  // page excludes bottom tab bar; video sits below Dynamic Island
  const pageHeight = height - tabBarHeight;
  const videoTop = insets.top;
  const videoHeight = pageHeight - insets.top;

  const players = useRef(new Map<string, Video | null>());
  const listRef = useRef<RNFlatList<Item>>(null);

  const [activeId, setActiveId] = useState<string>(DATA[0].id);
  const [paused, setPaused] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    players.current.forEach(async (p, id) => {
      if (!p) return;
      try {
        if (id === activeId && !paused) await p.playAsync();
        else await p.pauseAsync();
      } catch {}
    });
  }, [activeId, paused]);

  useEffect(() => {
    const i = DATA.findIndex((d) => d.id === activeId);
    const prev = DATA[i - 1]?.source;
    const next = DATA[i + 1]?.source;
    (async () => {
      try {
        if (prev) await preload(prev);
        if (next) await preload(next);
      } catch {}
      for (const id of [DATA[i - 1]?.id, DATA[i + 1]?.id].filter(
        Boolean
      ) as string[]) {
        try {
          await players.current
            .get(id)
            ?.setStatusAsync({ shouldPlay: false, positionMillis: 0 });
        } catch {}
      }
    })();
  }, [activeId]);

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
      await p.replayAsync();
    } catch {
      try {
        await p.unloadAsync();
        await p.loadAsync(
          source,
          { shouldPlay: id === activeId && !paused },
          true
        );
      } catch {}
    }
  };

  const TopBar = () => (
    <View
      style={{
        position: "absolute",
        top: insets.top + 6,
        left: 12,
        right: 12,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Feather name="more-horizontal" size={28} color="white" />
      <Feather name="search" size={22} color="white" />
    </View>
  );

  const RightRail = (item: Item) => {
    const liked = likedIds.has(item.id);
    let av = likeAnims.get(item.id);
    if (!av) {
      av = new Animated.Value(liked ? 1 : 0);
      likeAnims.set(item.id, av);
    }

    return (
      <View
        style={{
          position: "absolute",
          right: 12,
          bottom: 100 + insets.bottom,
          alignItems: "center",
        }}
      >
        {/* profile + plus */}
        <View style={{ alignItems: "center", marginBottom: 18 }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: "rgba(255,255,255,0.25)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="user" size={24} color="white" />
          </View>
          <View
            style={{
              position: "absolute",
              bottom: -4,
              right: 4,
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: "#ff3355",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AntDesign name="plus" size={14} color="white" />
          </View>
        </View>

        {/* like circle with 0.1s fill */}
        <Pressable
          onPress={() => {
            const toLiked = !liked;
            setLikedIds((prev) => {
              const next = new Set(prev);
              toLiked ? next.add(item.id) : next.delete(item.id);
              return next;
            });
            setLikeCounts((prev) => ({
              ...prev,
              [item.id]: Math.max(0, (prev[item.id] ?? 0) + (toLiked ? 1 : -1)),
            }));
            Animated.timing(av!, {
              toValue: toLiked ? 1 : 0,
              duration: 100,
              useNativeDriver: true,
            }).start();
          }}
          style={{ alignItems: "center", marginBottom: 14 }}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              borderWidth: 2,
              borderColor: "white",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <Animated.View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: "#ff0000ff",
                transform: [{ scale: av! }],
              }}
            />
          </View>
          <Text style={{ color: "white", fontSize: 12, marginTop: 6 }}>
            {formatCount(likeCounts[item.id] ?? 0)}
          </Text>
        </Pressable>

        {/* comments */}
        <View style={{ alignItems: "center", marginBottom: 14 }}>
          <Ionicons name="chatbubble-outline" size={30} color="white" />
          <Text style={{ color: "white", fontSize: 12, marginTop: 6 }}>
            {item.comments}
          </Text>
        </View>

        {/* bookmark */}
        <Pressable
          onPress={() => {
            setBookmarkedIds((prev) => {
              const next = new Set(prev);
              if (next.has(item.id)) next.delete(item.id);
              else next.add(item.id);
              return next;
            });
          }}
          style={{ alignItems: "center", marginBottom: 14 }}
        >
          <FontAwesome
            name={bookmarkedIds.has(item.id) ? "bookmark" : "bookmark-o"} // filled vs outline
            size={32}
            color={bookmarkedIds.has(item.id) ? "#ffd700" : "white"} // yellow when active
          />
        </Pressable>

        {/* share */}
        <View style={{ alignItems: "center" }}>
          <Feather name="send" size={30} color="white" />
        </View>
      </View>
    );
  };

  const CaptionBar = (item: Item) => (
    <View
      style={{
        position: "absolute",
        left: 12,
        right: 90,
        bottom: 110 + insets.bottom,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
        }}
      >
        <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>
          {item.user}
        </Text>
        <MaterialCommunityIcons
          name="check-decagram"
          size={16}
          color="#ffd166"
        />
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 6,
            backgroundColor: "rgba(255,255,255,0.15)",
          }}
        >
          <Text style={{ color: "white", fontSize: 10 }}>aura</Text>
        </View>
      </View>
      <Text style={{ color: "white", fontSize: 14 }} numberOfLines={2}>
        {item.caption}
      </Text>
    </View>
  );

  const BottomNav = () => (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
      <View style={{ paddingBottom: insets.bottom }}>
        <BlurView
          intensity={40}
          tint="dark"
          style={{
            marginHorizontal: 12,
            marginBottom: 10,
            borderRadius: 20,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              height: 64,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-around",
            }}
          >
            <Feather name="home" size={24} color="white" />
            <Feather name="grid" size={24} color="white" />
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: "#ff3355",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AntDesign name="plus" size={24} color="white" />
            </View>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={24}
              color="white"
            />
            <Feather name="user" size={24} color="white" />
          </View>
        </BlurView>
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: Item }) => {
    const isActive = item.id === activeId;

    return (
      <View
        style={{
          height: pageHeight,
          backgroundColor: "black",
          overflow: "hidden",
        }}
      >
        <Video
          ref={(r) => {
            players.current.set(item.id, r);
          }}
          source={item.source}
          style={{
            position: "absolute",
            top: videoTop,
            width,
            height: videoHeight,
          }}
          resizeMode={ResizeMode.COVER}
          isLooping
          shouldPlay={isActive && !paused}
          onError={() => handleVideoError(item.id, item.source)}
        />

        {/* tap to pause/play + centered play icon when paused */}
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
        top: 0,                 // overlay the whole visible area
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
        <Ionicons name="play" size={60} color="white" style={{ opacity: 0.3 }} />
      </View>
    </View>
  ) : null}
</Pressable>

        {/* overlays */}
        <TopBar />
        {RightRail(item)}
        {CaptionBar(item)}
        <BottomNav />
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
      decelerationRate="fast"
      bounces={false}
      scrollEventThrottle={16}
      snapToAlignment="start"
      showsVerticalScrollIndicator={false}
      onMomentumScrollEnd={onMomentumScrollEnd}
      initialNumToRender={3}
      windowSize={5}
      maxToRenderPerBatch={5}
      removeClippedSubviews={false}
      getItemLayout={(_, i) => ({
        length: pageHeight,
        offset: pageHeight * i,
        index: i,
      })}
      contentInsetAdjustmentBehavior="never"
    />
  );
}
