import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { toast } from '@/lib/toast';

const schema = z.object({
  email: z.string().trim().toLowerCase().email('Email không hợp lệ').max(254),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(128),
});
type FormValues = z.infer<typeof schema>;

export const RegisterPage = () => {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      await registerUser(values.email, values.password);
      navigate('/chat', { replace: true });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Đăng ký thất bại';
      toast({ variant: 'destructive', title: 'Đăng ký thất bại', description: message });
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <AuthShell
      title="Đăng ký"
      description="Tạo tài khoản mới để bắt đầu"
      footer={
        <>
          Đã có tài khoản?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Đăng nhập
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Mật khẩu</Label>
          <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}
        </Button>
      </form>
    </AuthShell>
  );
};
