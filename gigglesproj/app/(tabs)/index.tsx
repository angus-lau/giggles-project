import React, { useRef, useState, useEffect, memo } from "react";

import {
  View,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  useWindowDimensions,
  Pressable,
  Text,
  Animated,
  Image,
  TextInput,
  StyleSheet,
  Easing,
} from "react-native";
import {
  PanResponder,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
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
  url: string;           // S3 URL
  user: string;          // display name or user id
  caption: string;
  likes: number;
  comments: number;
};

type Comment = { id: string; user_id: string; text: string; created_at?: string; username?: string; users?: { username?: string } };

// temporary until auth
const USER_ID = "d4705bec-b3ab-4d7c-aa28-a10470adcbd7"; // users.id UUID
const USERNAME = "Angus";

// Use the correct host per environment:
// - iOS Simulator:            http://127.0.0.1:8000
// - Android Emulator:         http://10.0.2.2:8000
// - Physical device on Wi‑Fi: http://<YOUR_LAN_IP>:8000  (e.g., http://192.168.1.23:8000)
const API_BASE = "http://192.168.1.87:8000";


async function preload(source: AVPlaybackSource) {
  if (typeof source === "number")
    await Asset.fromModule(source).downloadAsync();
  else if ("uri" in source && source.uri)
    await Asset.fromURI(source.uri).downloadAsync();
}

const toItem = (v: any): Item => ({
  id: v?.id ?? '',
  url: v?.url ?? '',
  user: (v && (v.users?.username || v.user_id?.slice(0, 6))) || 'user',
  caption: v?.caption ?? '',
  likes: Number(v?.like_count ?? 0) || 0,
  comments: Number(v?.comment_count ?? 0) || 0,
});

const BottomNav = React.memo(
  function BottomNav() {
    const insets = useSafeAreaInsets();
    return (
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
              // reduce compositor flicker
              // @ts-ignore
              renderToHardwareTextureAndroid
              // @ts-ignore
              shouldRasterizeIOS
            >
              <View
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "white",
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.7,
                  shadowRadius: 10,
                }}
              >
                <Feather name="home" size={24} color="white" />
              </View>

              <View
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "white",
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.7,
                  shadowRadius: 10,
                }}
              >
                <Feather name="grid" size={24} color="white" />
              </View>

              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "white",
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.9,
                  shadowRadius: 12,
                }}
              >
                <Image
                  source={require("../../assets/images/gigglesLogo.png")}
                  style={{ width: 38, height: 38, resizeMode: "contain" }}
                />
              </View>

              <View
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "white",
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.7,
                  shadowRadius: 10,
                }}
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={24}
                  color="white"
                />
              </View>

              <View
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "white",
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.7,
                  shadowRadius: 10,
                }}
              >
                <Feather name="user" size={24} color="white" />
              </View>
            </View>
          </BlurView>
        </View>
      </View>
    );
  },
  () => true
); // never re-render
export default function Feed() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const likeAnims = useRef(new Map<string, Animated.Value>()).current;
  const [items, setItems] = useState<Item[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  const formatCount = (n: number) =>
    n < 1000 ? String(n) : `${(n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0)}K`;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/videos`);
        const data = await res.json();
        const mapped: Item[] = (data.videos ?? []).map(toItem);
        setItems(mapped);
        if (mapped.length) setActiveId(mapped[0].id);
        // seed like counts from server values
        const seed: Record<string, number> = {};
        for (const it of mapped) seed[it.id] = it.likes ?? 0;
        setLikeCounts(seed);
        // fetch liked video ids for this user to persist fill state
        try {
          const likedRes = await fetch(`${API_BASE}/users/${USER_ID}/likes`);
          const likedJson = await likedRes.json();
          const ids: string[] = likedJson?.video_ids ?? [];
          setLikedIds(new Set(ids));
        } catch {}
      } catch (e) {
        console.warn('Failed to load videos', e);
      }
    })();
  }, []);

  // keep heart fill in sync when likedIds loads from server
  useEffect(() => {
    try {
      likedIds.forEach((id) => {
        const v = likeAnims.get(id);
        if (v) v.setValue(1); // filled
      });
      // also clear any hearts no longer liked
      likeAnims.forEach((v, id) => {
        if (!likedIds.has(id)) v.setValue(0);
      });
    } catch {}
  }, [likedIds]);

  // page excludes bottom tab bar; video sits below Dynamic Island
  const pageHeight = height; // full screen
  const videoTop = insets.top; // below Dynamic Island
  const videoHeight = pageHeight - insets.top;

  const players = useRef(new Map<string, Video | null>());
  const listRef = useRef<FlatList<Item>>(null);

  const [paused, setPaused] = useState(false);

  const [openCommentsFor, setOpenCommentsFor] = useState<string | null>(null);
  const [commentsByVideo, setCommentsByVideo] = useState<Record<string, Comment[]>>({});
  const [commentInput, setCommentInput] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  const SHEET_H = Math.min(height * 0.85, 620);
  const MIN_Y = height - SHEET_H; // fully open
  const MAX_Y = height; // closed
  const sheetY = useRef(new Animated.Value(MAX_Y)).current;
  const inputBarY = useRef(new Animated.Value(0)).current;
  const [kbVisible, setKbVisible] = useState(false);

useEffect(() => {
  const show = Keyboard.addListener(
    Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
    (e) => {
      const h = e.endCoordinates?.height ?? 0;
      const adjusted = Math.max(0, h - (insets.bottom || 0));
      setKbVisible(true);
      Animated.timing(inputBarY, {
        toValue: -adjusted,
        duration: Platform.OS === "ios" ? Math.min(e.duration ?? 180, 180) : 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  );
  const hide = Keyboard.addListener(
    Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
    () => {
      setKbVisible(false);
      Animated.timing(inputBarY, {
        toValue: 0,
        duration: 140,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  );
  return () => { show.remove(); hide.remove(); };
}, [inputBarY, insets.bottom]);

  // video area = space above the comments sheet (updates while dragging)
  const videoAreaH = sheetY.interpolate({
    inputRange: [MIN_Y, MAX_Y], //
    outputRange: [height - SHEET_H, height],
    extrapolate: "clamp",
  });

  const openComments = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/videos/${id}?comments_limit=100`);
      const txt = await res.text();
      let data: any = null;
      try {
        data = txt ? JSON.parse(txt) : null;
      } catch (parseErr) {
        console.warn('Non-JSON response for /videos/{id}:', txt?.slice(0, 200));
        data = null;
      }

      if (!res.ok) {
        console.warn('Server error', res.status, data || txt);
        setCommentsByVideo((prev) => ({ ...prev, [id]: prev[id] ?? [] }));
      } else {
        const serverComments: Comment[] = (data?.comments ?? []).map((c: any) => ({
          id: c.id,
          user_id: c.user_id,
          text: c.text,
          created_at: c.created_at,
          username: c.username,
          users: c.users,
        }));
        setCommentsByVideo((prev) => ({ ...prev, [id]: serverComments }));
      }
    } catch (e) {
      console.warn('Failed to load comments', e);
      setCommentsByVideo((prev) => ({ ...prev, [id]: prev[id] ?? [] }));
    }
    setOpenCommentsFor(id);
    sheetY.setValue(MAX_Y);
    Animated.timing(sheetY, { toValue: MIN_Y, duration: 220, useNativeDriver: false }).start();
  };

  const closeComments = () => {
    Animated.timing(sheetY, {
      toValue: MAX_Y,
      duration: 180,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) setOpenCommentsFor(null);
    });
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 3,
      onPanResponderMove: (_, g) => {
        const next = Math.min(MAX_Y, Math.max(MIN_Y, MIN_Y + g.dy));
        sheetY.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const shouldClose = g.vy > 0.8 || g.dy > 120;
        Animated.timing(sheetY, {
          toValue: shouldClose ? MAX_Y : MIN_Y,
          duration: 180,
          useNativeDriver: false,
        }).start(({ finished }) => {
          if (finished && shouldClose) setOpenCommentsFor(null);
        });
      },
    })
  ).current;

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
    const i = items.findIndex((d) => d.id === activeId);
    const prev = items[i - 1]?.url;
    const next = items[i + 1]?.url;
    (async () => {
      try {
        if (prev) await preload({ uri: prev });
        if (next) await preload({ uri: next });
      } catch {}
      for (const id of [items[i - 1]?.id, items[i + 1]?.id].filter(
        Boolean
      ) as string[]) {
        try {
          await players.current
            .get(id)
            ?.setStatusAsync({ shouldPlay: false, positionMillis: 0 });
        } catch {}
      }
    })();
  }, [activeId, items]);

  useEffect(() => {
    setPaused(false);
  }, [activeId]);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.y / pageHeight);
    const next = items[index]?.id;
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
          onPress={async () => {
            const toLiked = !liked;
            // optimistic UI
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
              useNativeDriver: false,
            }).start();

            try {
              if (toLiked) {
                const r = await fetch(`${API_BASE}/videos/${item.id}/like?user_id=${encodeURIComponent(USER_ID)}`, { method: 'POST' });
                const j = await r.json();
                if (!r.ok) throw new Error(JSON.stringify(j));
                setLikeCounts((prev) => ({ ...prev, [item.id]: Number(j?.like_count ?? prev[item.id] ?? 0) }));
              } else {
                const r = await fetch(`${API_BASE}/videos/${item.id}/like?user_id=${encodeURIComponent(USER_ID)}`, { method: 'DELETE' });
                const j = await r.json();
                if (!r.ok) throw new Error(JSON.stringify(j));
                setLikeCounts((prev) => ({ ...prev, [item.id]: Number(j?.like_count ?? prev[item.id] ?? 0) }));
              }
            } catch (e) {
              console.warn('Persist like failed', e);
              // revert optimistic state on failure
              setLikedIds((prev) => {
                const next = new Set(prev);
                toLiked ? next.delete(item.id) : next.add(item.id);
                return next;
              });
              setLikeCounts((prev) => ({
                ...prev,
                [item.id]: Math.max(0, (prev[item.id] ?? 0) + (toLiked ? -1 : 1)),
              }));
              Animated.timing(av!, {
                toValue: liked ? 1 : 0,
                duration: 100,
                useNativeDriver: false,
              }).start();
            }
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
        <Pressable
          onPress={() => openComments(item.id)}
          style={{ alignItems: "center", marginBottom: 14 }}
        >
          <Ionicons name="chatbubble-outline" size={30} color="white" />
          <Text style={{ color: "white", fontSize: 12, marginTop: 6 }}>
            {formatCount(item.comments)}
          </Text>
        </Pressable>

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

  // replace the existing BottomNav definition

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
        {/* Only the video compresses */}
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: videoAreaH,
            overflow: "hidden",
          }}
        >
          <View style={{ flex: 1, paddingTop: insets.top }}>
            <Video
              ref={(r) => {
                players.current.set(item.id, r);
              }}
              source={{ uri: item.url }}
              style={{ flex: 1, width }}
              resizeMode={ResizeMode.COVER}
              isLooping
              shouldPlay={isActive && !paused}
              onError={() => handleVideoError(item.id, { uri: item.url })}
            />

            <Pressable
              onPress={() => {
                if (isActive) setPaused((v) => !v);
              }}
              style={StyleSheet.absoluteFill}
            >
              {isActive && paused ? (
                <View
                  pointerEvents="none"
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="play"
                    size={60}
                    color="white"
                    style={{ opacity: 0.3 }}
                  />
                </View>
              ) : null}
            </Pressable>
          </View>
        </Animated.View>

        {/* overlays stay stationary */}
        <TopBar />
        {RightRail(item)}
        {CaptionBar(item)}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        pagingEnabled
        snapToInterval={height} // use full screen height
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
          length: height,
          offset: height * i,
          index: i,
        })}
        contentInsetAdjustmentBehavior="never"
      />

      {/* Static bottom nav, never scrolls */}
      <BottomNav />
      {/* Comments Sheet */}
      {openCommentsFor ? (
        <>
          {/* backdrop */}
          <Pressable
            onPress={closeComments}
            style={{
              ...(StyleSheet.absoluteFillObject as any),
              backgroundColor: "rgba(0,0,0,0.45)",
            }}
          />
          {/* sheet */}
          <Animated.View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: SHEET_H,
              transform: [{ translateY: sheetY }],
              backgroundColor: "#121212",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              overflow: "hidden",
            }}
          >
            {/* grabber + title */}
            <View
              {...pan.panHandlers}
              style={{ alignItems: "center", paddingTop: 8, paddingBottom: 6 }}
            >
              <View
                style={{
                  width: 44,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: "rgba(255,255,255,0.25)",
                }}
              />
              <Text style={{ color: "white", fontWeight: "700", marginTop: 8 }}>
                Comments
              </Text>
            </View>

            {/* comments list */}
            <FlatList
  data={openCommentsFor ? (commentsByVideo[openCommentsFor] ?? []) : []}
  keyExtractor={(c) => c.id}
  contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12 }}
  renderItem={({ item }) => (
    <View style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 10 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", marginRight: 10 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
          {item.username || item.users?.username || item.user_id?.slice(0, 6) || "user"}
        </Text>
        <Text style={{ color: "white", fontSize: 14, marginTop: 2 }}>
          {item.text}
        </Text>
      </View>
    </View>
  )}
/>

            {/* input bar */}
            <Animated.View
              style={{
                transform: [{ translateY: inputBarY }], // slides above keyboard
                paddingTop: 10,
                paddingHorizontal: 16,
                paddingBottom: insets.bottom + 12,
                borderTopWidth: 0.5,
                borderTopColor: "rgba(255,255,255,0.1)",
                backgroundColor: "#121212",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {/* avatar */}
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: "rgba(255,255,255,0.3)",
                  }}
                />

                {/* input pill */}
                <View
                  style={{
                    flex: 1,
                    marginHorizontal: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "rgba(255,255,255,0.12)",
                    borderRadius: 22,
                    paddingHorizontal: 14,
                    minHeight: 44,
                  }}
                >
                  <TextInput
  placeholder="Add comment..."
  placeholderTextColor="rgba(255,255,255,0.6)"
  style={{ flex: 1, color: "white", paddingVertical: 8 }}
  value={openCommentsFor ? (commentInput[openCommentsFor] ?? "") : ""}
  onChangeText={(t) => {
    if (!openCommentsFor) return;
    setCommentInput((prev) => ({ ...prev, [openCommentsFor]: t }));
  }}
  returnKeyType="send"
  onSubmitEditing={async () => {
    if (!openCommentsFor) return;
    const text = (commentInput[openCommentsFor] ?? "").trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const url = `${API_BASE}/videos/${openCommentsFor}/comments?user_id=${encodeURIComponent(USER_ID)}&text=${encodeURIComponent(text)}`;
      const resp = await fetch(url, { method: 'POST' });
      const raw = await resp.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.warn('Non-JSON POST /comments response:', raw?.slice(0, 200));
      }
      if (!resp.ok) {
        console.warn('POST /comments failed', resp.status, json || raw);
        setSending(false);
        return;
      }
      const newRow: Comment = json?.comment ?? { id: String(Date.now()), user_id: USER_ID, text, username: USERNAME };
      setCommentsByVideo((prev) => ({
        ...prev,
        [openCommentsFor]: [...(prev[openCommentsFor] ?? []), newRow],
      }));
      setCommentInput((prev) => ({ ...prev, [openCommentsFor]: "" }));
      setItems((prev) =>
        prev.map((it) =>
          it.id === openCommentsFor
            ? { ...it, comments: Number((json && (json.comment_count ?? json.video?.comment_count)) ?? (it.comments ?? 0) + 1) }
            : it
        )
      );
    } catch (e) {
      console.warn("Failed to send comment", e);
    } finally {
      setSending(false);
    }
  }}
/>
<Ionicons name="happy-outline" size={20} color="rgba(255,255,255,0.8)" />
</View>

<Pressable
  disabled={sending || !openCommentsFor || !(commentInput[openCommentsFor]?.trim())}
  onPress={async () => {
    if (!openCommentsFor) return;
    const text = (commentInput[openCommentsFor] ?? "").trim();
    if (!text) return;
    setSending(true);
    try {
      const url = `${API_BASE}/videos/${openCommentsFor}/comments?user_id=${encodeURIComponent(USER_ID)}&text=${encodeURIComponent(text)}`;
      const resp = await fetch(url, { method: 'POST' });
      const raw = await resp.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.warn('Non-JSON POST /comments response:', raw?.slice(0, 200));
      }
      if (!resp.ok) {
        console.warn('POST /comments failed', resp.status, json || raw);
        setSending(false);
        return;
      }
      const newRow: Comment = json?.comment ?? { id: String(Date.now()), user_id: USER_ID, text, username: USERNAME };
      setCommentsByVideo((prev) => ({
        ...prev,
        [openCommentsFor]: [...(prev[openCommentsFor] ?? []), newRow],
      }));
      setCommentInput((prev) => ({ ...prev, [openCommentsFor]: "" }));
      setItems((prev) =>
        prev.map((it) =>
          it.id === openCommentsFor
            ? { ...it, comments: Number((json && (json.comment_count ?? json.video?.comment_count)) ?? (it.comments ?? 0) + 1) }
            : it
        )
      );
    } catch (e) {
      console.warn("Failed to send comment", e);
    } finally {
      setSending(false);
    }
  }}
  style={{
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    opacity: sending || !openCommentsFor || !(commentInput[openCommentsFor]?.trim()) ? 0.5 : 1,
  }}
>
  <Text style={{ color: "#33c759", fontWeight: "700", fontSize: 14 }}>Send</Text>
</Pressable>
              </View>
            </Animated.View>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}
