import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw,
  Shield,
  Target,
  Zap,
  DollarSign,
  Clock,
  BarChart3,
  Activity,
  Info,
  Moon,
  Sun,
  TrendingDown,
  ArrowDownUp,
  Layers,
  ChevronDown,
  ChevronUp,
  History,
  CheckCircle2,
  XCircle,
  Timer,
  Bell,
  BellRing,
  Star,
  StarOff,
  Plus,
  X,
  Eye,
  Trash2,
  Settings2,
  LineChart,
  TrendingUp,
  Trophy,
  AlertTriangle,
  Calendar,
  CalendarX,
  BookOpen,
  Lock,
} from "lucide-react";
import { Link } from "wouter";
import type { StrategyTrade, StrategyTradeWithEarnings, OptionLeg, StrategyType, ScanStatus, ScanRecord, WatchlistItem, Alert, BacktestResult, BacktestRequest, InsertJournalEntry } from "@shared/schema";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { UpgradeBanner, RedactedValue, UserMenu } from "@/components/UpgradeBanner";
import { Label } from "@/components/ui/label";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, Cell, ReferenceLine, Tooltip as RechartsTooltip } from "recharts";
import { Crosshair, BarChart2, PieChart, Award, Flame } from "lucide-react";
