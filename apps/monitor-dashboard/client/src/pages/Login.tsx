import { useState } from 'react';
import { Button, Form, Input, message, Card, Typography, Space } from 'antd';
import { useNavigate } from 'react-router-dom';
import { LockOutlined, UserOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { api, setToken } from '../api/client';
import { themeConfig } from '../theme';

const { Title, Text } = Typography;

export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values: { password: string }) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { password: values.password });
      setToken(data.token);
      message.success('登录成功');
      navigate('/dashboard');
    } catch (error) {
      message.error('验证失败，请检查密码');
    } finally {
      setLoading(false);
    }
  };

  const primaryColor = themeConfig.token?.colorPrimary as string;

  return (
    <div className="login-page-bg" style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: 24
    }}>
      <Card 
        bordered={false} 
        style={{ 
          width: '100%', 
          maxWidth: 400, 
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          borderRadius: 16
        }}
        bodyStyle={{ padding: '40px 32px' }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ 
            width: 48, 
            height: 48, 
            background: `linear-gradient(135deg, ${primaryColor}, #3b82f6)`, 
            borderRadius: 12, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: '#fff',
            fontSize: 24,
            fontWeight: 'bold',
            boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.3)'
          }}>B</div>
          <Title level={3} style={{ marginBottom: 4 }}>Inner Bot</Title>
          <Text type="secondary">登录以访问控制台</Text>
        </div>

        <Form 
          layout="vertical" 
          onFinish={onFinish}
          requiredMark={false}
          size="large"
        >
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入管理员密码' }]}
          >
            <Input.Password 
              prefix={<LockOutlined style={{ color: '#94a3b8' }} />} 
              placeholder="管理员密码" 
              style={{ borderRadius: 8 }}
            />
          </Form.Item>
          
          <Form.Item style={{ marginBottom: 0 }}>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={loading} 
              block
              style={{ 
                height: 44, 
                borderRadius: 8, 
                fontSize: 15,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              登录 <ArrowRightOutlined />
            </Button>
          </Form.Item>
        </Form>
      </Card>
      
      <div style={{ 
        position: 'absolute', 
        bottom: 24, 
        color: 'rgba(255,255,255,0.4)', 
        fontSize: 12 
      }}>
        © {new Date().getFullYear()} Inner Bot Server Monitor
      </div>
    </div>
  );
}
