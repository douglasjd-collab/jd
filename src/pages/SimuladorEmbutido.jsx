// Conteúdo igual ao SimuladorConsorcio atual
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calculator, Plus, Trash2, Download, Loader2, TrendingUp, X, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';

export default function SimuladorEmbutido() {
  // ... código completo do SimuladorConsorcio ...
  // (copiando todo o conteúdo)